import * as WebSocket from "ws";
import * as Readline from "readline";

class Turtle {
  private name: string;
  private ws: WebSocket;

  constructor(name: string, ws: WebSocket) {
    this.name = name;
    this.ws = ws;
  }
};

let turtles: Turtle[] = [];
let active: Turtle | null = null;

const wss = new WebSocket.Server({ port: 8888 });

wss.on("connection", (ws) => {
  ws.once("message", (name: string) => {
    turtles.push(new Turtle(name, ws));
  });
});

const io = Readline.createInterface({ input: process.stdin, output: process.stdout });

function commandline() {
  io.question("> ", (answer: string) => {
    io.write(`${answer}\n`);
    setTimeout(commandline, 0);
  });
}
setTimeout(commandline, 0);