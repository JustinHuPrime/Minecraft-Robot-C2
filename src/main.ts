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
    console.log(`\nTurtle ${name} connected`);
    if (active === null)
      active = t;
    ws.once("close", () => {
      turtles.filter((turtle) => turtle.name !== name);
      if (active !== null && active.name === name)
        active = null;
        console.log(`\nTurtle ${name} disconnected`);
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
  return t;
}

function release(t: Turtle) {
  t.status = TurtleStatus.IDLE;
  console.log(`\n${t.name} done task`);
  if (active === null)
    active = t;
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
            console.log("select expects one argument - the name of the turtle to select");
            continue;
          }

          const selected = turtles.find((turtle) => turtle.name === tokens[1]);
          if (selected === undefined) {
            console.log(`no such turtle ${tokens[1]}`);
            continue;
          }
          if (selected.status === TurtleStatus.BUSY) {
            console.log("turtle is busy - cannot select");
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
            console.log(`${tokens[0]} expects zero or one arguments`);
            continue;
          }
          if (active === null) {
            console.log(`${tokens[0]} expects an active turtle`);
            continue;
          }

          if (tokens.length === 1) {
            active.ws.send(`turtle.${tokens[0]}()`);
            break;
          }

          const count = Number.parseInt(tokens[1]);
          if (isNaN(count)) {
            console.log(`invalid count '${tokens[1]}'`);
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
            console.log("left expects zero arguments");
            continue;
          }
          if (active === null) {
            console.log("left expects an active turtle");
            continue;
          }

          active.ws.send(`turtle.turnLeft()`);
          break;
        }
        case "right": {
          if (tokens.length !== 1) {
            console.log("right expects zero arguments");
            continue;
          }
          if (active === null) {
            console.log("right expects an active turtle");
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
            console.log(`${tokens[0]} expects zero or one arguments`);
            continue;
          }
          if (active === null) {
            console.log(`${tokens[0]} expects an active turtle`);
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
                console.log(`invalid up/down modifier: ${tokens[1]}`);
                continue;
              }
            }
          }
          break;
        }
        case "drop": {

          if (tokens.length !== 1 && tokens.length !== 2 && tokens.length !== 3) {
            console.log("drop expects zero, one, two arguments");
            continue;
          }
          if (active === null) {
            console.log("drop expects an active turtle");
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
                    console.log(`invalid count '${tokens[2]}'`);
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
                    console.log(`invalid count '${tokens[2]}'`);
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
                    console.log(`invalid count '${tokens[2]}'`);
                    continue;
                  }
                  active.ws.send(`turtle.drop(${count})`);
                }
                break;
              }
              default: {
                console.log(`invalid up/down modifier: ${tokens[1]}`);
                continue;
              }
            }
          }
          break;
        }
        case "inspect": {
          if (tokens.length !== 1 && tokens.length !== 2) {
            console.log("inspect expects zero or one arguments");
            continue;
          }
          if (active === null) {
            console.log("inspect expects an active turtle");
            continue;
          }

          if (tokens.length === 1) {
            active.ws.send("local a, b = turtle.inspect(); return b");
            console.log(`${await getReply()}`);
          } else {
            switch (tokens[1]) {
              case "up": {
                active.ws.send("local a, b = turtle.inspectUp(); return b");
                console.log(`${await getReply()}`);
                break;
              }
              case "down": {
                active.ws.send("local a, b = turtle.inspectDown(); return b");
                console.log(`${await getReply()}`);
                break;
              }
              default: {
                console.log(`invalid up/down modifier: ${tokens[1]}`);
                continue;
              }
            }
          }
          break;
        }
        case "tunnel": {
          if (tokens.length !== 2 && tokens.length !== 3) {
            console.log("tunnel expects one or two arguments");
            continue;
          }
          if (active === null) {
            console.log("tunnel expects an active turtle");
            continue;
          }

          const len = Number.parseInt(tokens[1]);
          if (isNaN(len)) {
            console.log(`invalid tunnel length '${tokens[1]}'`);
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
                console.log(`invalid up/down modifier: ${tokens[1]}`);
                continue;
              }
            }
          }
          break;
        }
        // inventory management (display, select, fuel, refuel, transfer, equip, craft)
        case "inventory": {
          if (tokens.length !== 1) {
            console.log("inventory expects no arguments");
            continue;
          }
          if (active === null) {
            console.log("inventory requires an active turtle");
            continue;
          }

          active.ws.send("return turtle.getSelectedSlot()");
          const selected = Number.parseInt(await getReply());
          for (let idx = 1; idx <= 16; ++idx) {
            active.ws.send(`return turtle.getItemDetail(${idx})`);
            if (selected === idx)
              console.log("*");
            else
              console.log(" ");
            if (idx < 10)
              console.log(` ${idx}: `);
            else
              console.log(`${idx}: `);

            console.log(`${await getReply()}`);
          }
          break;
        }
        case "slot": {
          if (tokens.length !== 2) {
            console.log("slot expects one argument");
            continue;
          }
          if (active === null) {
            console.log("slot expects an active turtle");
            continue;
          }

          const slot = Number.parseInt(tokens[1]);
          if (isNaN(slot)) {
            console.log(`invalid slot '${tokens[1]}'`);
            continue;
          }

          active.ws.send(`turtle.select(${slot})`);
          break;
        }
        case "fuel": {
          if (tokens.length !== 1) {
            console.log("fuel expects no arguments");
            continue;
          }
          if (active === null) {
            console.log("fuel requires an active turtle");
            continue;
          }

          active.ws.send("return turtle.getFuelLevel()");
          const level = Number.parseInt(await getReply());
          active.ws.send("return turtle.getFuelLimit()");
          const limit = Number.parseInt(await getReply());
          console.log(`Fuel: ${level}/${limit}`);
          break;
        }
        case "refuel": {
          if (tokens.length !== 1 && tokens.length !== 2) {
            console.log("refuel expects zero or one arguments");
            continue;
          }
          if (active === null) {
            console.log("refuel expects an active turtle");
            continue;
          }

          if (tokens.length === 1) {
            active.ws.send(`turtle.refuel()`);
            break;
          }

          const count = Number.parseInt(tokens[2]);
          if (isNaN(count)) {
            console.log(`invalid count '${tokens[2]}'`);
            continue;
          }

          active.ws.send(`turtle.refuel(${count})`);
          break;
        }
        case "transfer": {
          if (tokens.length !== 2 && tokens.length !== 3) {
            console.log("transfer expects one or two arguments");
            continue;
          }
          if (active === null) {
            console.log("transfer expects an active turtle");
            continue;
          }

          const destination = Number.parseInt(tokens[1]);
          if (isNaN(destination)) {
            console.log(`invalid slot '${tokens[1]}`);
            continue;
          }

          if (tokens.length === 2) {
            active.ws.send(`turtle.transferTo(${destination})`);
            break;
          }

          const count = Number.parseInt(tokens[2]);
          if (isNaN(count)) {
            console.log(`invalid count '${tokens[2]}'`);
            continue;
          }

          active.ws.send(`turtle.transferTo(${destination}, ${count})`);
          break;
        }
        case "equip": {
          if (tokens.length !== 2) {
            console.log("equip expects one argument");
            continue;
          }
          if (active === null) {
            console.log("equip expects an active turtle");
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
              console.log(`invalid left/right modifier: ${tokens[1]}`);
              continue;
            }
          }
          break;
        }
        case "craft": {
          if (tokens.length !== 1 && tokens.length !== 2) {
            console.log("craft expects zero or one arguments");
            continue;
          }
          if (active === null) {
            console.log("craft expects an active turtle");
            continue;
          }

          if (tokens.length === 1) {
            active.ws.send(`turtle.craft()`);
            break;
          }

          const count = Number.parseInt(tokens[1]);
          if (isNaN(count)) {
            console.log(`invalid count '${tokens[1]}'`);
            continue;
          }

          active.ws.send(`turtle.craft(${count})`);
          break;
        }
        // miscellaneous (exec, help, list, exit)
        case "exec": {
          if (tokens.length < 2) {
            console.log("exec expects a string - the code to execute");
            continue;
          }
          if (active === null) {
            console.log("exec requires an active turtle");
            continue;
          }

          const matches = line.match(/exec\s+(.+)/);
          const message = (matches as RegExpMatchArray)[1];

          active.ws.send(message);
          console.log(`${await getReply()}`);
          break;
        }
        case "help": {
          console.log("select <turtle name>\n\tmarks turtle as active turtle");
          console.log("forward|back|up|down [n]\n\tmove in given direction n or one blocks");
          console.log("left|right\n\tturn in given direction");
          console.log("dig|place|attack|suck [up|down]\n\tinteract with the world in the given direction, or forwards, if none given");
          console.log("drop [up|down|forward] [count]\n\tdrop count (or whole stack of) items from inventory in given direction, or forwards, if none given");
          console.log("inspect [up|down]\n\tget information about the world in the given direction, or forwards, if none given");
          console.log("tunnel <n> [up|down]\n\tdig an n-long tunnel in the given direction, or forwards, if none given");
          console.log("inventory\n\tdisplay information about turtle inventory");
          console.log("slot <n>\n\tselect turtle inventory slot n");
          console.log("fuel\n\tdisplay turtle fuel status");
          console.log("refuel [limit]\n\trefuel the turtle using at most the given number of items (uses whole stack if none given)");
          console.log("transfer <destination> [count]\n\ttransfers count (or whole stack if not given) to destination slot");
          console.log("equip <left|right>\n\tswaps the current slot with the left or right side equipment");
          console.log("craft [limit]\n\tcrafts up to limit (or as many as possible, if not given) items");
          console.log("exec <lua code>\n\truns some lua code as the body of a zero-arg function, and prints the return value, if any");
          console.log("help [args...]\n\tdisplays help text");
          console.log("list\n\tlists all connected turtles");
          console.log("exit\n\tgracefully closes connections to turtles and quits the program");
          break;
        }
        case "list": {
          for (const turtle of turtles) {
            if (turtle === active)
              console.log("*");
            else
              console.log(" ");
            console.log(` ${turtle.name} (${turtle.status === TurtleStatus.BUSY ? "BUSY" : "IDLE"})`);
          }
          break;
        }
        case "exit": {
          if (tokens.length !== 1) {
            console.log("exit expects no arguments");
            continue;
          }

          for (const turtle of turtles)
            turtle.ws.close();
          wss.close();
          process.exit(0);
        }
        default: {
          console.log(`no such command ${tokens[0]}`);
          continue;
        }
      }
    } catch (e) {
      console.log(`${e}`);
    }
  }
}
commandLoop();