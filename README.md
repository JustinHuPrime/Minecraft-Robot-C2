# Minecraft Robot C2

A command and control server for ComputerCraft turtles connecting over websockets.

## Supported Commands

```
select <turtle name>
        marks turtle as active turtle
forward|back|up|down [n]
        move in given direction n or one blocks
left|right
        turn in given direction
dig|place|attack|suck [up|down]
        interact with the world in the given direction, or forwards, if none given
drop [up|down]
        drop items from inventory in given direction, or forwards, if none given
inspect [up|down]
        get information about the world in the given direction, or forwards, if none given
tunnel <n> [up|down]
        dig an n-long tunnel in the given direction, or forwards, if none given
inventory
        display information about turtle inventory
slot <n>
        select turtle inventory slot n
fuel
        display turtle fuel status
refuel [limit]
        refuel the turtle using at most the given number of items (uses whole stack if none given)
transfer <destination> [count]
        transfers count (or whole stack if not given) to destination slot
equip <left|right>
        swaps the current slot with the left or right side equipment
craft [limit]
        crafts up to limit (or as many as possible, if not given) items
exec <lua code>
        runs some lua code as the body of a zero-arg function, and prints the return value, if any
help [args...]
        displays help text
list
        lists all connected turtles
exit
        gracefully closes connections to turtles and quits the program
```
