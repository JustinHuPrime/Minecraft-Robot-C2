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

async function getReply(turtle: Turtle | undefined = undefined): Promise<string> {
  if (turtle === undefined && active === null)
    return Promise.reject(new Error("no selected turtle"));

  return new Promise<string>((resolve, reject) => {
    const t = turtle === undefined ? (active as Turtle) : turtle;
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

async function repeat(count: number, command: string): Promise<void> {
  const t = (active as Turtle);
  t.status = TurtleStatus.BUSY;
  active = null;

  for (let idx = count; idx > 0; --idx) {
    t.ws.send(command);
    await getReply(t);
  }

  t.status = TurtleStatus.IDLE;
  io.write(`\n${t.name} done task\n`);
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
          if (selected.status === TurtleStatus.BUSY) {
            io.write("turtle is busy - cannot select\n");
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
            io.write(`invalid count '${tokens[1]}'\n`);
            continue;
          }

          if (count > 10) {
            repeat(count, `turtle.${tokens[0]}()`);
          } else {
            for (let idx = count; idx > 0; --idx) {
              active.ws.send(`turtle.${tokens[0]}()`);
              getReply();
            }
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
        // world interaction (dig, tunnel, place, drop, attack, suck, inspect)
        case "dig":
        case "place":
        case "drop":
        case "attack":
        case "suck": {
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
          } else {
            switch (tokens[1]) {
              case "up": {
                active.ws.send(`turtle.${tokens[0]}Up()`);
                break;
              }
              case "down": {
                active.ws.send(`turtle.${tokens[0]}Down()`);
                break;
              }
              default: {
                io.write(`invalid up/down modifier: ${tokens[1]}\n`);
                continue;
              }
            }
          }
          break;
        }
        case "inspect": {
          if (tokens.length !== 1 && tokens.length !== 2) {
            io.write("inspect expects zero or one arguments\n");
            continue;
          }
          if (active === null) {
            io.write("inspect expects an active turtle\n");
            continue;
          }

          if (tokens.length === 1) {
            active.ws.send("local a, b = turtle.inspect(); return b");
          } else {
            switch (tokens[1]) {
              case "up": {
                active.ws.send("local a, b = turtle.inspectUp(); return b");
                break;
              }
              case "down": {
                active.ws.send("local a, b = turtle.inspectDown(); return b");
                break;
              }
              default: {
                io.write(`invalid up/down modifier: ${tokens[1]}\n`);
                continue;
              }
            }
          }
          break;
        }
        case "tunnel": {
          if (tokens.length !== 2 && tokens.length !== 3) {
            io.write("tunnel expects one or two arguments\n");
            continue;
          }
          if (active === null) {
            io.write("tunnel expects an active turtle\n");
            continue;
          }

          const len = Number.parseInt(tokens[1]);
          if (isNaN(len)) {
            io.write(`invalid tunnel length '${tokens[1]}'`);
            continue;
          }

          if (tokens.length === 2) {
            repeat(len, "turtle.dig(); turtle.forward()");
          } else {
            switch (tokens[2]) {
              case "up": {
                repeat(len, "turtle.digUp(); turtle.up()");
                break;
              }
              case "down": {
                repeat(len, "turtle.digDown(); turtle.down()");
                break;
              }
              default: {
                io.write(`invalid up/down modifier: ${tokens[1]}\n`);
                continue;
              }
            }
          }
          break;
        }
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
            io.write(`invalid slot '${tokens[1]}'\n`);
            continue;
          }

          active.ws.send(`turtle.select(${slot})`);
          break;
        }
        case "fuel": {
          if (tokens.length !== 1) {
            io.write("fuel expects no arguments\n");
            continue;
          }
          if (active === null) {
            io.write("fuel requires an active turtle\n");
            continue;
          }

          active.ws.send("return turtle.getFuelLevel()");
          const level = Number.parseInt(await getReply());
          active.ws.send("return turtle.getFuelLimit()");
          const limit = Number.parseInt(await getReply());
          io.write(`Fuel: ${level}/${limit}\n`);
          break;
        }
        case "refuel": {
          if (tokens.length !== 1 && tokens.length !== 2) {
            io.write("refuel expects zero or one arguments\n");
            continue;
          }
          if (active === null) {
            io.write("refuel expects an active turtle\n");
            continue;
          }

          if (tokens.length === 1) {
            active.ws.send(`turtle.refuel()`);
            break;
          }

          const count = Number.parseInt(tokens[2]);
          if (isNaN(count)) {
            io.write(`invalid count '${tokens[2]}'\n`);
            continue;
          }

          active.ws.send(`turtle.refuel(${count})`);
          break;
        }
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
            io.write(`invalid slot '${tokens[1]}\n`);
            continue;
          }

          if (tokens.length === 2) {
            active.ws.send(`turtle.transferTo(${destination})`);
            break;
          }

          const count = Number.parseInt(tokens[2]);
          if (isNaN(count)) {
            io.write(`invalid count '${tokens[2]}'\n`);
            continue;
          }

          active.ws.send(`turtle.transferTo(${destination}, ${count})`);
          break;
        }
        case "equip": {
          if (tokens.length !== 2) {
            io.write("equip expects one argument\n");
            continue;
          }
          if (active === null) {
            io.write("equip expects an active turtle\n");
            continue;
          }

          switch (tokens[1]) {
            case "left": {
              active.ws.send("turtle.equipLeft()");
              break;
            }
            case "right": {
              active.ws.send("turtle.equipRight()");
              break;
            }
            default: {
              io.write(`invalid left/right modifier: ${tokens[1]}\n`);
              continue;
            }
          }
          break;
        }
        case "craft": {
          if (tokens.length !== 2) {
            io.write("craft expects one argument\n");
            continue;
          }
          if (active === null) {
            io.write("craft expects an active turtle\n");
            continue;
          }

          const count = Number.parseInt(tokens[2]);
          if (isNaN(count)) {
            io.write(`invalid count '${tokens[2]}'\n`);
            continue;
          }

          active.ws.send(`turtle.craft(${count})`);
          break;
        }
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