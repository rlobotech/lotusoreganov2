This is a game project.
I will add here all the info that is on top of my head to create this game.

This game is going to be a idle party rpg game for web.
All combat will be processed in the backend server.
Players will be able to manage their characters in the UI, equip items, define skills, select missions, etc etc.

The game can be played solo or multiplayer.
The game runs as a party of 2-6 characters.
In single player you define the size of your group 2-6.
In multiplayer each player creates its own character and add to the group.

It will require an user account to play the game.

How the game works.
It is a idle game.
So the party will go through the world exploring, hunting and doing quests.
The party will automatically do hunting while no orders are giving or no quests are in the queue.
There will be a world that the party will be exploring. The world is divided in small hexagons. Each has something or is empty.
Parts of the world is unlocked by bosses dungeons that the party will have to defeat to unlock. 
The multiplayer group (or the player in solo) may give orders to the party to do. Order can be do quests or go to specific locations on the world map.
The world map will be rich with dungeons, cities, forests and things to visit.
When an order is given, the party will finish what they are doing and move to the order. The order can be basically do a quest, go to a specific place.
A player can give multiple order or assign multiple quests. Once one order is accepted the party will try to finish it before proceeding to the next one.
Player can vote to cancel a order if needed. Order will have votes. Each vote will move it to the priority. Example two players want the quest 1 to have priority 1 and one player want the quest 2 has priority 1. The party will do quest 1, once it is finished it will go to next quest/order.
Multiple player can give different orders in the same party. When this happens the party will go to the order with most votes.
The quests available are the same for the whole party.
The party always work together.
When the party is defeated it goes back to the nearest city and lose gold coins and maybe items in the bag.
The combat is done in turns, each player and monster will follow an its ai configuration done by the player or for the enemies a defined one.
Each character in combat act at least once a turn. When the turn ends some EOT effects happens.
The combat works in a square grid system, it is 2.5D. Different 'arenas' but all with their size limit but different formats.
The art is pixel and all monsters characters uses just a few sprites without animation, like idle, in combat, death, and some others.
The movement makes the character move from one square to the other, its animation is like south park where the sprite moves from one side to the other while moving in scene, it does not have an animation it is just the sprite swinging.
The combat will use vfx to dispaly the attacks. like sword attack (a sword movement on the enemy), fire ball goes from the caster to the enemy and explode.
The whole combat will be calculated on the backend side. It will be write in a combat log. It will be used for the UI to display the replay so we can watch a movie. Players don't decide anything in the combat. What they can do is outside the combat like setting the ai config, thier equipment.
The whole combat log will be saved on the database so players can watch the replay.
The idea is that players may only need to join the game once a day or a few times a day, so they can watch all the combat replays, adjust they AI, equip new items, put some points and select new quests or give new order to go to specific locations.
The combat is in turn, so we see each action, monster and players moving around and using skills until one is defeted. After the party, if players are in the wild they can rest to regain some health. if they are inside a dungeon not always it will be possible to rest. there will be consecutives fights. The rest could be a configuration that the party set.
The backend server will do calculation every x minutes (x could be 1 or 5 or something else, I am still deciding). These calculations will display where the party is in the world, or if they are fighting or if there is a event.
The world map is divided by zones. each zone has a level range like 1-3, 4-5. The world map will have different cities in different regions. Player will access different regions after defeating bosses dugeons by doing the bosses quests. Players will be able to teleport from one city to the other by paying gold. When a group is defetead they go back to the last city that the visited. If one member of the group survive, the group survive which mean they will rest to recovery before proceeding.
Max lvl is 100. The game is defined to be played in seasons of 3 months. players who play a lot and optimize a lot should be able to achieve lvl 100 in 45 days.
There will be pvp events that rarely happens. Which will take two groups of the same level and make them fight. The looser wont go back to the city but will stop to rest. There will also be an arena in the city which the group can order to party to go and fight.
This is an async game, sometimes all members of the group will be logged in updating their character and select their priority in the orders. Sometimes one player will be there alone giving orders. Sometimes no one will be playing. The game will always be active
The idea is that the group can assign different orders like different quests and locations to go so it will take hours of the day, lets say 10 hours to complete everything so when they go back to the game their party will become more strong, they will equip new items found, will manage new AI and set new orders.

Races
Human, Elf, Dward and Orc (we will expand for more later)

Classes
Warrior, Barbarian, Paladin, Mage, Necromancer, Priest, Ranger, Rogue and Druid (we will expand for more later)

Player character will have attributes, equipements, skills and combat AI.

The party will have a shared level, experience and bag.
Each player will have their own personal 10 bag slots, which other players in the group cant access (unless you are playing solo).
The party group will have a 40 bag slots. Items can be sold on the city. When the bag is full, new items will ocupy the space of the items with lowest item level or rarity. Items can be favorited by any player so they wont be automatically discarded. 

Character will have attributes that are modified by equipments and by leveling up.

Combat AI will work like final fantasy 12. Player may select what skills are priority to which conditions.
- Example, priority 1 cast heal on nearby player with 50% or less health. priority 1 cast less heal on a player with 80% less health. priority 3 use skill x to buff player with greater max health. priority 4 use mele attack on close enemy. priority 5...
- There will be many actions, many condition, many targets that players will be able to choose.

players will have skills and they can define any on their priority. Skills consume mana and may have cooldown.
- skills are adquired based on the current skills that the players are using, like skyrim. like a mage that specializes in fire skill will adquire more fire skills. the more you use the more chance you have to adquire that skill tree skills.

The world will be huge, with many different monster, many different encounter, skills, events.

There will be a leaderboard. And there will be two modes of player standard and hardcore. hardcore the game is over if the whole party is defetead.





