import * as WebSocket from "ws";
import * as Readline from "readline";

enum TurtleStatus {
  IDLE,
  BUSY,
}

class Turtle {
  public name: string;
  public ws: WebSocket;
  public status: TurtleStatus;

  constructor(name: string, ws: WebSocket) {
    this.name = name;
    this.ws = ws;
    this.status = TurtleStatus.IDLE;
  }
};

let turtles: Turtle[] = [];
let active: Turtle | null = null;

const wss = new WebSocket.Server({ port: 8888 });
const io = Readline.createInterface({ input: process.stdin, output: process.stdout });

wss.on("connection", (ws) => {
  ws.once("message", (name: string) => {
    turtles.push(new Turtle(name, ws));
    io.write(`\nTurtle ${name} connected\n`);
  });
});

async function commandLoop(): Promise<void> {
  while (true) {
    const line: string = await new Promise<string>((resolve, _) => { io.question(active !== null ? `${active.name}> ` : "> ", resolve); });

    if (line.trim() === "") continue;

    const tokens = line.split(/\s+/);
    switch (tokens[0]) {
      case "select": {
        if (tokens.length !== 2) {
          io.write("select expects one argument - the name of the turtle to select\n");
          continue;
        }

        const selected: Turtle | undefined = turtles.find((turtle) => turtle.name === tokens[1]);
        if (selected === undefined) {
          io.write(`no such turtle ${tokens[1]}\n`);
          continue;
        }

        active = selected;
        break;
      }
      case "exec": {
        if (tokens.length < 2) {
          io.write("exec expects a string - the code to execute\n");
          continue;
        }
        if (active === null) {
          io.write("exec requires an active turtle\n");
          continue;
        }

        const matches = line.match(/exec\s+(.+)/);
        const message = (matches as RegExpMatchArray)[1];

        active.ws.send(message);
        const response = await new Promise<string>((resolve, reject) => {
          (active as Turtle).ws.once("error", reject);
          (active as Turtle).ws.once("message", resolve);
        })
        io.write(`${response}\n`);
        break;
      }
      default: {
        io.write(`no such command ${tokens[0]}\n`);
        continue;
      }
    }
  }
}
commandLoop();