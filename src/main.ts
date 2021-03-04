// Copyright 2021 Justin Hu
//
// SPDX-Licence-Identifier: AGPL-3.0-or-later
//
// N-Planetary is free software: you can redistribute it and/or modify it under
// the terms of the GNU Affero General Public License as published by the Free
// Software Foundation, either version 3 of the License, or (at your option) any
// later version.
//
// N-Planetary is distributed in the hope that it will be useful, but WITHOUT ANY
// WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A
// PARTICULAR PURPOSE. See the GNU General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License along
// with N-Planetary. If not, see <https://www.gnu.org/licenses/>.

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

const port = process.argv[2] ? Number.parseInt(process.argv[2]) : 8888;
if (isNaN(port) || port < 0 || port > 65535) {
  console.log(`Not a valid port: ${port}`);
  process.exit(-1);
}

const wss = new WebSocket.Server({ port: port });
const io = Readline.createInterface({ input: process.stdin, output: process.stdout });

wss.on("connection", (ws) => {
  ws.once("message", (name: string) => {
    const t = new Turtle(name, ws)
    turtles.push(t);
    process.stdout.write(`\nTurtle ${name} connected\n`);
    if (active === null) {
      active = t;
      io.setPrompt(`${active.name}> `);
    }
    io.prompt();
    ws.once("close", () => {
      turtles = turtles.filter((turtle) => turtle.name !== name);
      if (active !== null && active.name === name) {
        active = null;
        io.setPrompt(`> `);
      }
      process.stdout.write(`\nTurtle ${name} disconnected\n`);
      io.prompt();
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

function assign(): Turtle {
  if (active === null)
    throw new Error("Expected an active turtle");

  const t = active;
  t.status = TurtleStatus.BUSY;
  active = null;
  io.setPrompt(`> `);
  return t;
}

function release(t: Turtle) {
  t.status = TurtleStatus.IDLE;
  process.stdout.write(`\n${t.name} done task\n`);
  if (active === null) {
    active = t;
    io.setPrompt(`${active.name}> `);
  }
  io.prompt();
}

async function repeat(count: number, command: string): Promise<void> {
  const t = assign();

  for (let idx = count; idx > 0; --idx) {
    t.ws.send(command);
    await getReply(t);
  }

  release(t);
}

async function commandLoop(): Promise<void> {
  while (true) {
    try {
      const line: string = (await new Promise<string>((resolve, _) => { io.question(active !== null ? `${active.name}> ` : "> ", resolve); })).trim();

      if (line === "") continue;

      const tokens = line.split(/\s+/);
      switch (tokens[0]) {
        // turtle management (select)
        case "select": {
          if (tokens.length !== 2) {
            process.stdout.write("select expects one argument - the name of the turtle to select\n");
            continue;
          }

          const selected = turtles.find((turtle) => turtle.name === tokens[1]);
          if (selected === undefined) {
            process.stdout.write(`no such turtle ${tokens[1]}\n`);
            continue;
          }
          if (selected.status === TurtleStatus.BUSY) {
            process.stdout.write("turtle is busy - cannot select\n");
            continue;
          }

          active = selected;
          io.setPrompt(`${active.name}> `);
          break;
        }
        // movement (forward, back, up, down, left, right)
        case "forward":
        case "back":
        case "up":
        case "down": {
          if (tokens.length !== 1 && tokens.length !== 2) {
            process.stdout.write(`${tokens[0]} expects zero or one arguments\n`);
            continue;
          }
          if (active === null) {
            process.stdout.write(`${tokens[0]} expects an active turtle\n`);
            continue;
          }

          if (tokens.length === 1) {
            active.ws.send(`turtle.${tokens[0]}()`);
            break;
          }

          const count = Number.parseInt(tokens[1]);
          if (isNaN(count)) {
            process.stdout.write(`invalid count '${tokens[1]}'\n`);
            continue;
          }

          if (count > 10) {
            repeat(count, `turtle.${tokens[0]}()`);
          } else {
            for (let idx = count; idx > 0; --idx) {
              active.ws.send(`turtle.${tokens[0]}()`);
              await getReply();
            }
          }
          break;
        }
        case "left": {
          if (tokens.length !== 1) {
            process.stdout.write("left expects zero arguments\n");
            continue;
          }
          if (active === null) {
            process.stdout.write("left expects an active turtle\n");
            continue;
          }

          active.ws.send(`turtle.turnLeft()`);
          break;
        }
        case "right": {
          if (tokens.length !== 1) {
            process.stdout.write("right expects zero arguments\n");
            continue;
          }
          if (active === null) {
            process.stdout.write("right expects an active turtle\n");
            continue;
          }

          active.ws.send(`turtle.turnRight()`);
          break;
        }
        // world interaction (dig, tunnel, place, drop, attack, suck, inspect)
        case "dig":
        case "place":
        case "attack":
        case "suck": {
          if (tokens.length !== 1 && tokens.length !== 2) {
            process.stdout.write(`${tokens[0]} expects zero or one arguments\n`);
            continue;
          }
          if (active === null) {
            process.stdout.write(`${tokens[0]} expects an active turtle\n`);
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
                process.stdout.write(`invalid up/down modifier: ${tokens[1]}\n`);
                continue;
              }
            }
          }
          break;
        }
        case "drop": {
          if (tokens.length !== 1 && tokens.length !== 2 && tokens.length !== 3) {
            process.stdout.write("drop expects zero, one, two arguments\n");
            continue;
          }
          if (active === null) {
            process.stdout.write("drop expects an active turtle\n");
            continue;
          }

          if (tokens.length === 1) {
            active.ws.send("turtle.drop()");
          } else {
            switch (tokens[1]) {
              case "up": {
                if (tokens.length === 2) {
                  active.ws.send("turtle.dropUp()");
                } else {
                  const count = Number.parseInt(tokens[2]);
                  if (isNaN(count)) {
                    process.stdout.write(`invalid count '${tokens[2]}'`);
                    continue;
                  }
                  active.ws.send(`turtle.dropUp(${count})`);
                }
                break;
              }
              case "down": {
                if (tokens.length === 2) {
                  active.ws.send("turtle.dropDown()");
                } else {
                  const count = Number.parseInt(tokens[2]);
                  if (isNaN(count)) {
                    process.stdout.write(`invalid count '${tokens[2]}'`);
                    continue;
                  }
                  active.ws.send(`turtle.dropDown(${count})`);
                }
                break;
              }
              case "forward": {
                if (tokens.length === 2) {
                  active.ws.send("turtle.drop()");
                } else {
                  const count = Number.parseInt(tokens[2]);
                  if (isNaN(count)) {
                    process.stdout.write(`invalid count '${tokens[2]}'`);
                    continue;
                  }
                  active.ws.send(`turtle.drop(${count})`);
                }
                break;
              }
              default: {
                process.stdout.write(`invalid up/down modifier: ${tokens[1]}\n`);
                continue;
              }
            }
          }
          break;
        }
        case "inspect": {
          if (tokens.length !== 1 && tokens.length !== 2) {
            process.stdout.write("inspect expects zero or one arguments\n");
            continue;
          }
          if (active === null) {
            process.stdout.write("inspect expects an active turtle\n");
            continue;
          }

          if (tokens.length === 1) {
            active.ws.send("local a, b = turtle.inspect(); return b");
            process.stdout.write(`${await getReply()}\n`);
          } else {
            switch (tokens[1]) {
              case "up": {
                active.ws.send("local a, b = turtle.inspectUp(); return b");
                process.stdout.write(`${await getReply()}\n`);
                break;
              }
              case "down": {
                active.ws.send("local a, b = turtle.inspectDown(); return b");
                process.stdout.write(`${await getReply()}\n`);
                break;
              }
              default: {
                process.stdout.write(`invalid up/down modifier: ${tokens[1]}\n`);
                continue;
              }
            }
          }
          break;
        }
        case "tunnel": {
          if (tokens.length !== 2 && tokens.length !== 3) {
            process.stdout.write("tunnel expects one or two arguments\n");
            continue;
          }
          if (active === null) {
            process.stdout.write("tunnel expects an active turtle\n");
            continue;
          }

          const len = Number.parseInt(tokens[1]);
          if (isNaN(len)) {
            process.stdout.write(`invalid tunnel length '${tokens[1]}'`);
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
                process.stdout.write(`invalid up/down modifier: ${tokens[1]}\n`);
                continue;
              }
            }
          }
          break;
        }
        case "prospect": {
          if (tokens.length !== 3) {
            process.stdout.write("prospect expects two arguments\n");
            continue;
          }
          if (active === null) {
            process.stdout.write("prospect expects an active turtle\n");
            continue;
          }

          const len = Number.parseInt(tokens[1]);
          if (isNaN(len)) {
            process.stdout.write(`invalid prospect limit '${tokens[1]}'`);
            continue;
          }

          const resource = tokens[2];

          (async () => {
            const t = assign();

            for (let idx = 0; idx < len; ++idx) {
              t.ws.send("turtle.dig(); turtle.forward()");

              // left
              t.ws.send("turtle.left(); local a, b = turtle.inspectUp(); turtle.right(); return b");
              if ((await getReply()).includes(resource)) {
                process.stdout.write(`\n${t.name} found ${resource}\n`);
                break;
              }
              // right
              t.ws.send("turtle.right(); local a, b = turtle.inspectUp(); turtle.left(); return b");
              if ((await getReply()).includes(resource)) {
                process.stdout.write(`\n${t.name} found ${resource}\n`);
                break;
              }
              // up
              t.ws.send("local a, b = turtle.inspectUp(); return b");
              if ((await getReply()).includes(resource)) {
                process.stdout.write(`\n${t.name} found ${resource}\n`);
                break;
              }
              // down
              t.ws.send("local a, b = turtle.inspectDown(); return b");
              if ((await getReply()).includes(resource)) {
                process.stdout.write(`\n${t.name} found ${resource}\n`);
                break;
              }
              // front
              t.ws.send("local a, b = turtle.inspect(); return b");
              if ((await getReply()).includes(resource)) {
                process.stdout.write(`\n${t.name} found ${resource}\n`);
                break;
              }
            }

            release(t);
          })();
          break;
        }
        // inventory management (display, select, fuel, refuel, transfer, equip, craft)
        case "inventory": {
          if (tokens.length !== 1) {
            process.stdout.write("inventory expects no arguments\n");
            continue;
          }
          if (active === null) {
            process.stdout.write("inventory requires an active turtle\n");
            continue;
          }

          active.ws.send("return turtle.getSelectedSlot()");
          const selected = Number.parseInt(await getReply());
          for (let idx = 1; idx <= 16; ++idx) {
            active.ws.send(`return turtle.getItemDetail(${idx})`);
            if (selected === idx)
              process.stdout.write("*");
            else
              process.stdout.write(" ");
            if (idx < 10)
              process.stdout.write(` ${idx}: `);
            else
              process.stdout.write(`${idx}: `);

            process.stdout.write(`${await getReply()}\n`);
          }
          break;
        }
        case "slot": {
          if (tokens.length !== 2) {
            process.stdout.write("slot expects one argument\n");
            continue;
          }
          if (active === null) {
            process.stdout.write("slot expects an active turtle\n");
            continue;
          }

          const slot = Number.parseInt(tokens[1]);
          if (isNaN(slot)) {
            process.stdout.write(`invalid slot '${tokens[1]}'\n`);
            continue;
          }

          active.ws.send(`turtle.select(${slot})`);
          break;
        }
        case "fuel": {
          if (tokens.length !== 1) {
            process.stdout.write("fuel expects no arguments\n");
            continue;
          }
          if (active === null) {
            process.stdout.write("fuel requires an active turtle\n");
            continue;
          }

          active.ws.send("return turtle.getFuelLevel()");
          const level = Number.parseInt(await getReply());
          active.ws.send("return turtle.getFuelLimit()");
          const limit = Number.parseInt(await getReply());
          process.stdout.write(`Fuel: ${level}/${limit}\n`);
          break;
        }
        case "refuel": {
          if (tokens.length !== 1 && tokens.length !== 2) {
            process.stdout.write("refuel expects zero or one arguments\n");
            continue;
          }
          if (active === null) {
            process.stdout.write("refuel expects an active turtle\n");
            continue;
          }

          if (tokens.length === 1) {
            active.ws.send(`turtle.refuel()`);
            break;
          }

          const count = Number.parseInt(tokens[1]);
          if (isNaN(count)) {
            process.stdout.write(`invalid count '${tokens[1]}'\n`);
            continue;
          }

          active.ws.send(`turtle.refuel(${count})`);
          break;
        }
        case "transfer": {
          if (tokens.length !== 2 && tokens.length !== 3) {
            process.stdout.write("transfer expects one or two arguments\n");
            continue;
          }
          if (active === null) {
            process.stdout.write("transfer expects an active turtle\n");
            continue;
          }

          const destination = Number.parseInt(tokens[1]);
          if (isNaN(destination)) {
            process.stdout.write(`invalid slot '${tokens[1]}\n`);
            continue;
          }

          if (tokens.length === 2) {
            active.ws.send(`turtle.transferTo(${destination})`);
            break;
          }

          const count = Number.parseInt(tokens[2]);
          if (isNaN(count)) {
            process.stdout.write(`invalid count '${tokens[2]}'\n`);
            continue;
          }

          active.ws.send(`turtle.transferTo(${destination}, ${count})`);
          break;
        }
        case "equip": {
          if (tokens.length !== 2) {
            process.stdout.write("equip expects one argument\n");
            continue;
          }
          if (active === null) {
            process.stdout.write("equip expects an active turtle\n");
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
              process.stdout.write(`invalid left/right modifier: ${tokens[1]}\n`);
              continue;
            }
          }
          break;
        }
        case "craft": {
          if (tokens.length !== 1 && tokens.length !== 2) {
            process.stdout.write("craft expects zero or one arguments\n");
            continue;
          }
          if (active === null) {
            process.stdout.write("craft expects an active turtle\n");
            continue;
          }

          if (tokens.length === 1) {
            active.ws.send(`turtle.craft()`);
            break;
          }

          const count = Number.parseInt(tokens[1]);
          if (isNaN(count)) {
            process.stdout.write(`invalid count '${tokens[1]}'\n`);
            continue;
          }

          active.ws.send(`turtle.craft(${count})`);
          break;
        }
        // miscellaneous (exec, help, list, exit)
        case "exec": {
          if (tokens.length < 2) {
            process.stdout.write("exec expects a string - the code to execute\n");
            continue;
          }
          if (active === null) {
            process.stdout.write("exec requires an active turtle\n");
            continue;
          }

          const matches = line.match(/exec\s+(.+)/);
          const message = (matches as RegExpMatchArray)[1];

          active.ws.send(message);
          process.stdout.write(`${await getReply()}\n`);
          break;
        }
        case "help": {
          process.stdout.write("select <turtle name>\n\tmarks turtle as active turtle\n");
          process.stdout.write("forward|back|up|down [n]\n\tmove in given direction n or one blocks\n");
          process.stdout.write("left|right\n\tturn in given direction\n");
          process.stdout.write("dig|place|attack|suck [up|down]\n\tinteract with the world in the given direction, or forwards, if none given\n");
          process.stdout.write("drop [up|down|forward] [count]\n\tdrop count (or whole stack of) items from inventory in given direction, or forwards, if none given\n");
          process.stdout.write("inspect [up|down]\n\tget information about the world in the given direction, or forwards, if none given\n");
          process.stdout.write("tunnel <n> [up|down]\n\tdig an n-long tunnel in the given direction, or forwards, if none given\n");
          process.stdout.write("prospect <n> <pattern>\n\tdig an n-long tunnel forwards, stopping if any block exposed by the tunnel matches the given pattern\n");
          process.stdout.write("inventory\n\tdisplay information about turtle inventory\n");
          process.stdout.write("slot <n>\n\tselect turtle inventory slot n\n");
          process.stdout.write("fuel\n\tdisplay turtle fuel status\n");
          process.stdout.write("refuel [limit]\n\trefuel the turtle using at most the given number of items (uses whole stack if none given)\n");
          process.stdout.write("transfer <destination> [count]\n\ttransfers count (or whole stack if not given) to destination slot\n");
          process.stdout.write("equip <left|right>\n\tswaps the current slot with the left or right side equipment\n");
          process.stdout.write("craft [limit]\n\tcrafts up to limit (or as many as possible, if not given) items\n");
          process.stdout.write("exec <lua code>\n\truns some lua code as the body of a zero-arg function, and prints the return value, if any\n");
          process.stdout.write("help [args...]\n\tdisplays help text\n");
          process.stdout.write("list\n\tlists all connected turtles\n");
          process.stdout.write("exit\n\tgracefully closes connections to turtles and quits the program\n");
          break;
        }
        case "list": {
          for (const turtle of turtles) {
            if (turtle === active)
              process.stdout.write("*");
            else
              process.stdout.write(" ");
            process.stdout.write(` ${turtle.name} (${turtle.status === TurtleStatus.BUSY ? "BUSY" : "IDLE"})\n`);
          }
          break;
        }
        case "exit": {
          if (tokens.length !== 1) {
            process.stdout.write("exit expects no arguments\n");
            continue;
          }

          for (const turtle of turtles)
            turtle.ws.close();
          wss.close();
          process.exit(0);
        }
        default: {
          process.stdout.write(`no such command ${tokens[0]}\n`);
          continue;
        }
      }
    } catch (e) {
      process.stdout.write(`${e}\n`);
    }
  }
}
commandLoop();