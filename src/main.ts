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
    ws.once("close", () => {
      turtles.filter((turtle) => turtle.name !== name);
      if (active !== null && active.name === name)
        active = null;
      io.write(`\nTurtle ${name} disconnected\n`);
    });
  });
});

async function getReply(): Promise<string> {
  if (active === null)
    return Promise.reject(new Error("no selected turtle"));

  return new Promise<string>((resolve, reject) => {
    const t = (active as Turtle);
    const closeCallback = () => {
      t.ws.off("error", errorCallback);
      t.ws.off("message", messageCallback);
      reject(new Error("connection closed"));
    }
    const errorCallback = (e: Error) => {
      t.ws.off("close", closeCallback);
      t.ws.off("message", messageCallback);
      reject(e);
    };
    const messageCallback = (msg: string) => {
      t.ws.off("error", errorCallback);
      t.ws.off("close", closeCallback);
      resolve(msg);
    }
    t.ws.once("error", errorCallback);
    t.ws.once("close", closeCallback);
    t.ws.once("message", messageCallback);
  });
}

async function commandLoop(): Promise<void> {
  while (true) {
    try {
      const line: string = await new Promise<string>((resolve, _) => { io.question(active !== null ? `${active.name}> ` : "> ", resolve); });

      if (line.trim() === "") continue;

      const tokens = line.split(/\s+/);
      switch (tokens[0]) {
        // turtle management (select)
        case "select": {
          if (tokens.length !== 2) {
            io.write("select expects one argument - the name of the turtle to select\n");
            continue;
          }

          const selected = turtles.find((turtle) => turtle.name === tokens[1]);
          if (selected === undefined) {
            io.write(`no such turtle ${tokens[1]}\n`);
            continue;
          }

          active = selected;
          break;
        }
        // movement (forward, back, up, down, left, right)
        case "forward":
        case "back":
        case "up":
        case "down": {
          if (tokens.length !== 1 && tokens.length !== 2) {
            io.write(`${tokens[0]} expects zero or one arguments\n`);
            continue;
          }
          if (active === null) {
            io.write(`${tokens[0]} expects an active turtle\n`);
            continue;
          }

          if (tokens.length === 1) {
            active.ws.send(`turtle.${tokens[0]}()`);
            break;
          }

          const count = Number.parseInt(tokens[1]);
          if (isNaN(count)) {
            io.write(`invalid count '${tokens[1]}'`);
            continue;
          }

          for (let idx = count; idx > 0; --idx) {
            active.ws.send(`turtle.${tokens[0]}()`);
            break;
          }
          break;
        }
        case "left": {
          if (tokens.length !== 1) {
            io.write("left expects zero arguments\n");
            continue;
          }
          if (active === null) {
            io.write("left expects an active turtle\n");
            continue;
          }

          active.ws.send(`turtle.turnLeft()`);
          break;
        }
        case "right": {
          if (tokens.length !== 1) {
            io.write("left expects zero arguments\n");
            continue;
          }
          if (active === null) {
            io.write("left expects an active turtle\n");
            continue;
          }

          active.ws.send(`turtle.turnRight()`);
          break;
        }
        // world interaction (dig, place, drop, attack, suck, inspect)
        case "dig": { }
        case "place": { }
        case "drop": { }
        case "attack": { }
        case "suck": { }
        case "inspect": { }
        // inventory management (display, select, fuel, refuel, transfer, equip, craft)
        case "inventory": {
          if (tokens.length !== 1) {
            io.write("inventory expects no arguments\n");
            continue;
          }
          if (active === null) {
            io.write("inventory requires an active turtle\n");
            continue;
          }

          active.ws.send("return turtle.getSelectedSlot()");
          const selected = Number.parseInt(await getReply());
          for (let idx = 1; idx <= 16; ++idx) {
            active.ws.send(`return turtle.getItemDetail(${idx})`);
            if (selected === idx)
              io.write("*");
            else
              io.write(" ");
            if (idx < 10)
              io.write(` ${idx}: `);
            else
              io.write(`${idx}: `);

            io.write(`${await getReply()}\n`);
          }
          break;
        }
        case "slot": {
          if (tokens.length !== 2) {
            io.write("slot expects one argument\n");
            continue;
          }
          if (active === null) {
            io.write("slot expects an active turtle\n");
            continue;
          }

          const slot = Number.parseInt(tokens[1]);
          if (isNaN(slot)) {
            io.write(`invalid slot '${tokens[1]}'`);
            continue;
          }

          active.ws.send(`turtle.select(${slot})`);
          break;
        }
        case "fuel": { }
        case "refuel": { }
        case "transfer": {
          if (tokens.length !== 2 && tokens.length !== 3) {
            io.write("transfer expects one or two arguments\n");
            continue;
          }
          if (active === null) {
            io.write("transfer expects an active turtle\n");
            continue;
          }

          const destination = Number.parseInt(tokens[1]);
          if (isNaN(destination)) {
            io.write(`invalid slot '${tokens[1]}`);
            continue;
          }

          if (tokens.length === 2) {
            active.ws.send(`turtle.transferTo(${destination})`);
            break;
          }

          const count = Number.parseInt(tokens[2]);
          if (isNaN(count)) {
            io.write(`invalid count '${tokens[2]}'`);
            continue;
          }

          active.ws.send(`turtle.transferTo(${destination}, ${count})`);
          break;
        }
        case "equip": { }
        case "craft": { }
        // miscellaneous (exec, exit)
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
          io.write(`${await getReply()}\n`);
          break;
        }
        case "exit": {
          if (tokens.length !== 1) {
            io.write("exit expects no arguments\n");
            continue;
          }

          for (const turtle of turtles)
            turtle.ws.close();
          wss.close();
          process.exit(0);
        }
        default: {
          io.write(`no such command ${tokens[0]}\n`);
          continue;
        }
      }
    } catch (e) {
      io.write(`${e}\n`);
    }
  }
}
commandLoop();