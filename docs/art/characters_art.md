# RPG Character Prompts: Race x Class

## Where the game looks for the pictures

Character pictures go in `apps/web/public/sprites/characters/`, one pair per hero: `<race>_<class>_se.png` (the south-east view the battle scene uses; it is flipped to face west, so enemies and anything walking left look left) and `<race>_<class>_front.png` (the front view of the inventory, the character sheet and party creation). Race is human, elf, dwarf or orc; class is the lowercase class id (warrior, barbarian, paladin, priest, mage, warlock, necromancer, shaman, druid, ranger, rogue). A missing file is skipped: a drawn placeholder figure is used instead, so art can be added one hero at a time. Monsters and summons are `apps/web/public/sprites/<name>.png` (for example `goblin.png`, `imp.png`, `skeleton.png`).

32x32 characters for the Pixel Lab style generator (all 8 directions are generated; we only use the south-east one).

## Generator settings (same for every character)
- Character Type: Humanoid
- Generation Mode: Pro
- Character Size: 32px
- Camera View: High Top-Down (matches the 32x32 isometric tileset)
- Style Character: pick one finished character so the whole roster shares a style
- Reference/style images: the "how to generate" image (outline, 2-3 tone shading, no anti-aliasing, no gradients, transparent background)
- Color palette: paste the **Palette** line of each character into the Color palette box. Max colours: No limit.

The prompt only describes the character (race, look, class, stance, gear, color identity). Style, size, view and palette come from the settings above.

## Warrior

### Human Warrior

Prompt:
```
Pixel art fantasy RPG character of a human man, fair skin, short brown hair and stubble, warrior class, idle stance. Wears steel plate armor over a deep crimson tabard, brass buckles and trim, round steel shield and a longsword. Color identity: steel gray metal, crimson cloth, brass details.
```

Palette:
```
#1c1c24 #3e4450 #6b7380 #a7afba #e1e6eb #5c1420 #9a2230 #c9a24a #f2c6a0 #d99e78 #a8694a #6a4428 #3e2616
```

### Elf Warrior

Prompt:
```
Pixel art fantasy RPG character of an elf, pale skin, long pointed ears, platinum hair in a ponytail, warrior class, idle stance. Wears sleek silver scale armor over a deep green tabard with pale gold trim, slim round shield and a curved longsword. Color identity: silver metal, deep green cloth, pale gold.
```

Palette:
```
#18201c #3c4a46 #6e7e7a #aab8b4 #e4ecea #1c4a30 #2e7a4a #d8c27a #f7e2d0 #e2bea6 #b48e78 #f0ecd8 #c4bea0
```

### Dwarf Warrior

Prompt:
```
Pixel art fantasy RPG character of a dwarf, short and stocky, ruddy skin, long braided red beard, warrior class, idle stance. Wears heavy dark iron plate armor with bronze rivets, a navy blue tabard, horned helmet, round shield and a broad axe. Color identity: dark iron, navy blue cloth, bronze details.
```

Palette:
```
#141418 #2e3036 #50545c #7c8088 #1e2a5a #34509a #8a5a2a #c8884a #e8a988 #c4785a #8f4f3a #c0552a #7e3018
```

### Orc Warrior

Prompt:
```
Pixel art fantasy RPG character of an orc, muscular, olive green skin, small lower tusks, black topknot, warrior class, idle stance. Wears crude blackened iron plates over rust-brown leather, a torn crimson sash, spiked shield and a heavy cleaver-sword. Color identity: blackened iron, rust leather, crimson sash.
```

Palette:
```
#161414 #2e2a2a #4e4846 #7a726c #5a3420 #8a5232 #8a1e22 #c43a32 #8fb052 #5f7f34 #3c5222 #e8e0c8 #1e1a1a
```

## Barbarian

### Human Barbarian

Prompt:
```
Pixel art fantasy RPG character of a human man, sun-tanned skin, long wild black hair, barbarian class, aggressive idle stance. Bare-chested with brown leather straps and belt, cream fur mantle, bone trinkets, teal woad war paint stripes on face and arms, big two-handed axe. Color identity: warm browns, bone cream, bright teal paint.
```

Palette:
```
#1e140e #4a2e1c #7a4e2e #a8784a #d9c3a0 #f1ead8 #1d6b78 #3fa8b0 #d9a074 #b07a52 #7a5034 #2a2228 #121014
```

### Elf Barbarian

Prompt:
```
Pixel art fantasy RPG character of a wild elf, tanned bronze skin, long pointed ears, braided copper hair, barbarian class, aggressive idle stance. Green-dyed leather wraps, white wolf pelt over the shoulders, feathers in the hair, blue-violet war paint, twin hand axes. Color identity: mossy green leather, white fur, blue-violet paint.
```

Palette:
```
#1a1612 #3a3a24 #5e6a34 #8ea050 #c8ccc4 #f4f6f2 #4a3a9a #7a6ad8 #d8a070 #b07a4e #7c5232 #c46a2a #8a4218
```

### Dwarf Barbarian

Prompt:
```
Pixel art fantasy RPG character of a dwarf, short and stocky, weathered tan skin, shaved head, huge braided black beard, barbarian class, aggressive idle stance. Dark leather harness with iron studs, thick brown bear pelt cloak, red ochre war paint, huge two-handed warhammer. Color identity: dark browns, iron gray, red ochre paint.
```

Palette:
```
#1a100c #3e2416 #6a4028 #94643c #5a5c62 #a0a4aa #9a2a1a #d4502e #d49a72 #aa7250 #764a32 #26201e #100c0c
```

### Orc Barbarian

Prompt:
```
Pixel art fantasy RPG character of an orc, muscular, dark forest green skin, large lower tusks, black mohawk, barbarian class, aggressive idle stance. Bare-chested with brown leather straps, gray wolf fur mantle, bone trinkets and skull belt, bright teal war paint, big two-handed axe. Color identity: warm browns, gray fur, bright teal paint.
```

Palette:
```
#1e140e #4a2e1c #7a4e2e #6e6a66 #a8a4a0 #f1ead8 #1d6b78 #3fa8b0 #5e7e3a #42602a #2a3e1a #f0e8d0 #141210
```

## Paladin

### Human Paladin

Prompt:
```
Pixel art fantasy RPG character of a human man, light skin, short golden blond hair, paladin class, noble upright stance. Wears polished white-silver plate armor with gold trim, a royal blue cape, gold sun emblem on the chest, warhammer and kite shield. Color identity: bright silver-white, rich gold, royal blue.
```

Palette:
```
#22263a #8a93a8 #c8d0dc #f4f6fa #8a6418 #d4a62a #f5d878 #3a6fc4 #f6d2b4 #e0ac88 #b07e5e #f0cc60 #b88e2c
```

### Elf Paladin

Prompt:
```
Pixel art fantasy RPG character of a high elf, porcelain skin, long pointed ears, long silver hair, paladin class, noble upright stance. Wears white-silver plate armor with pale gold filigree, a long teal cape, silver leaf emblem, slender spear and kite shield. Color identity: silver-white, pale gold, teal.
```

Palette:
```
#1e2a30 #8a9aa4 #c8d4da #f4f8fa #a0884a #dcc888 #1e6a6e #3aa4a0 #fae8dc #e8c8b8 #bc9a8c #e0e4ec #a8b0c0
```

### Dwarf Paladin

Prompt:
```
Pixel art fantasy RPG character of a dwarf, short and stocky, rosy fair skin, neat golden beard, paladin class, noble upright stance. Wears heavy gold-plated armor over dark red cloth, anvil emblem on the chest, massive warhammer and tower shield. Color identity: heavy gold, dark red cloth, pale steel.
```

Palette:
```
#241a14 #6a3a10 #a86a18 #e0a82a #f8dc7a #5a1418 #8e2228 #c8c4bc #f0bea0 #d4987a #a06a52 #e0b048 #a07a24
```

### Orc Paladin

Prompt:
```
Pixel art fantasy RPG character of an orc, muscular, pale sage green skin, small lower tusks, shaved head, paladin class, noble upright stance. Wears dented silver plate armor with gold trim, a royal purple cape, gold sun emblem, two-handed maul. Color identity: silver, gold, royal purple.
```

Palette:
```
#22203a #8a8aa0 #c8c8d4 #f0f0f4 #8a6418 #d4a62a #4a2a7a #7a4ab8 #a8c08a #84a066 #5a7444 #f0ead8
```

## Mage

### Human Mage

Prompt:
```
Pixel art fantasy RPG character of a human woman, light olive skin, long auburn hair, mage class, casting idle pose. Wears long deep blue robes and a pointed hat with silver star embroidery, wooden staff topped with a glowing cyan crystal, cyan sparks around the hand. Color identity: deep blues, glowing cyan, silver.
```

Palette:
```
#10142e #1e2f7a #2f55c4 #5a8ef0 #9fe4ff #e6f9ff #c0c8d8 #6a4a2a #e8c098 #c89670 #8e6646 #a2462a #6a2a18
```

### Elf Mage

Prompt:
```
Pixel art fantasy RPG character of an elf, cool pale skin, long pointed ears, long violet-black hair, mage class, casting idle pose. Wears flowing emerald and white robes with silver leaf embroidery, a circlet, slender white staff with a glowing teal orb. Color identity: emerald green, white, glowing teal.
```

Palette:
```
#0e2018 #1a5a3a #2e8a5a #e8f0ec #c0c8c8 #5af0d8 #c8fff4 #a8a8a0 #f0dcd4 #d4b8b0 #a48a84 #3a2a4a #1c1426
```

### Dwarf Mage

Prompt:
```
Pixel art fantasy RPG character of a dwarf, short and stocky, pale skin, long white beard tucked into the belt, mage class, casting idle pose. Wears thick crimson robes with gold rune embroidery, rune-carved iron staff with a glowing orange fire crystal, small flames around the hand. Color identity: crimson, gold runes, orange fire.
```

Palette:
```
#1e0c0c #5a1414 #8e2020 #c8a040 #3a3a40 #ff8a2a #ffd060 #fff4c0 #f2cdb4 #d6a88e #a07c68 #f0f0ec #b8b8b4
```

### Orc Mage

Prompt:
```
Pixel art fantasy RPG character of an orc, gray-green skin, small lower tusks, long gray braid, mage class, casting idle pose. Wears ragged indigo robes and hood with bone beads, crooked wooden staff with a glowing cyan crystal, cyan sparks around the hand. Color identity: indigo, bone, glowing cyan.
```

Palette:
```
#0e0e24 #22205a #3a3a96 #6a6ac8 #9fe4ff #e6f9ff #d8d0b8 #5a3e24 #8e9e7c #6c7c5c #4a563e #e8e0c8 #8a8a8a
```

## Necromancer

### Human Necromancer

Prompt:
```
Pixel art fantasy RPG character of a human, very pale gray skin, long straight black hair, necromancer class, hunched sinister stance. Wears tattered black and dark gray hooded robes, bone pauldrons, skull on the belt, bone staff with a skull top emitting sickly green glow and wisps. Color identity: near-black cloth, pale bone, toxic green.
```

Palette:
```
#0c0a10 #1f1a26 #3a3242 #5c5266 #d8d2bc #1f7a2e #4fd65a #b8ff8a #e0d8d0 #b8aea6 #847a74 #22202a #0e0c12
```

### Elf Necromancer

Prompt:
```
Pixel art fantasy RPG character of a dark elf, ashen gray-blue skin, long pointed ears, long white hair, necromancer class, hunched sinister stance. Wears elegant black and deep purple robes with silver trim and a high collar, slender silver staff with a glowing violet crystal and purple wisps. Color identity: black, deep purple, glowing violet.
```

Palette:
```
#0c0a12 #1e1428 #3a2450 #5e3a7e #b8b8c8 #8a4ad8 #c48aff #f0dcff #8a92a8 #646c84 #444a5e #ece8f0 #b8b4c4
```

### Dwarf Necromancer

Prompt:
```
Pixel art fantasy RPG character of a dwarf, short and stocky, sickly grayish skin, thin gray beard, necromancer class, hunched sinister stance. Wears dark brown and black hooded robes with iron and bone armor pieces, skull lantern on the belt, iron staff with a skull top emitting sickly green glow. Color identity: dark brown, bone, toxic green.
```

Palette:
```
#0e0a08 #241a14 #3e3028 #605248 #d8d2bc #1f7a2e #4fd65a #b8ff8a #c8bcae #a49686 #74685c #8a8890 #5c5a62
```

### Orc Necromancer

Prompt:
```
Pixel art fantasy RPG character of an orc, ashen gray skin, cracked lower tusks, stringy black hair, necromancer class, hunched sinister stance. Wears black rags and leather, bone necklace and skull shoulder pads, totem staff emitting blood red glow and red wisps. Color identity: black rags, bone, blood red magic.
```

Palette:
```
#0c0808 #1e1414 #362626 #d8ccb0 #a89c80 #7a0e14 #d42a2a #ff8a7a #8a8a84 #66665e #44443e #d8cca8 #18161a
```

## Priest

### Human Priest

Prompt:
```
Pixel art fantasy RPG character of a human woman, dark brown skin, short curly black hair, priest class, calm praying idle pose. Wears flowing ivory robes with a saffron orange stole and sash, holding a holy book, soft warm yellow holy light around the hands. No armor. Color identity: soft ivory, saffron orange, warm gold light.
```

Palette:
```
#2a1e14 #b8a888 #e8dcc0 #fffaf0 #9a4a10 #e08a1e #ffc04a #fff1a8 #8a5a3c #6a4028 #482a1a #2a1e1a #141010
```

### Elf Priest

Prompt:
```
Pixel art fantasy RPG character of an elf, warm fair skin, long pointed ears, long honey-blonde hair, priest class, calm praying idle pose. Wears flowing white robes with a pale blue stole and silver moon emblem, holding a crystal lantern with soft cool silver light. No armor. Color identity: white, pale blue, cool silver light.
```

Palette:
```
#1e2430 #a8b4c4 #dce4ee #fafcff #4a6aa8 #7a9ad8 #c8d8f8 #e8f0ff #f6d8bc #e0b494 #b08a6c #e8c070 #b8903e
```

### Dwarf Priest

Prompt:
```
Pixel art fantasy RPG character of a dwarf, short and stocky, warm brown skin, gray-streaked brown beard, priest class, calm praying idle pose. Wears sturdy ivory robes over chainmail with a dark red stole, holding a hammer and holy book, warm yellow holy light around the hands. Color identity: ivory, dark red, warm gold light.
```

Palette:
```
#2a1e14 #b8a888 #e8dcc0 #fffaf0 #6a1a1a #a8302a #ffc04a #fff1a8 #b8805a #94603e #64402a #7a6a5e #4a3e34
```

### Orc Priest

Prompt:
```
Pixel art fantasy RPG character of an orc, mossy green skin, short lower tusks, white topknot, priest class, calm praying idle pose. Wears rough brown hide robes with ivory bone ornaments and an ochre shaman stole, wooden totem staff with warm yellow light. Color identity: brown hide, ochre, warm gold light.
```

Palette:
```
#1e140c #4a3420 #7a5a38 #e0d4b4 #9a5a10 #d08a24 #ffc04a #fff1a8 #7a9a4a #5a7834 #3c5022 #ece4cc #e8e8e8
```

## Ranger

### Human Ranger

Prompt:
```
Pixel art fantasy RPG character of a human man, medium brown skin, tied-back dark brown hair, ranger class, alert idle stance. Wears a dark forest green hooded cloak, tan leather armor and boots, quiver with rust-red fletched arrows, holding a longbow. Color identity: deep forest greens, tan leather, rust red.
```

Palette:
```
#141a10 #233a1e #3c6230 #5f8a44 #5e3f24 #8f6638 #c49a62 #b8452a #b07a52 #8c5a38 #5e3a22 #4a3020 #2a1a10
```

### Elf Ranger

Prompt:
```
Pixel art fantasy RPG character of a wood elf, light tan skin, long pointed ears, braided chestnut hair, ranger class, alert idle stance. Wears a light gray-green hooded cloak, pale leather armor, quiver with white feather arrows, elegant curved longbow with teal wrapping. Color identity: gray-green, pale leather, teal accents.
```

Palette:
```
#161c18 #3a4a42 #6a8072 #a4b8a8 #8a7454 #c4ac84 #ece4cc #3a8a7a #e8c4a0 #c89c76 #946e50 #7a4a2a #4e2c16
```

### Dwarf Ranger

Prompt:
```
Pixel art fantasy RPG character of a dwarf, short and stocky, tanned skin, short brown beard, ranger class, alert idle stance. Wears a brown hooded cloak, dark leather armor with fur collar, holding a crossbow, short axe and bolts at the belt. Color identity: earthy browns, iron gray, moss accents.
```

Palette:
```
#18120c #3a2a1c #5e4430 #8a6848 #b08c64 #5a5c60 #9a9ca0 #3c5a2a #dca07a #b67a56 #82543a #6a4428 #40281a
```

### Orc Ranger

Prompt:
```
Pixel art fantasy RPG character of an orc, brownish green skin, lower tusks, brown braids, ranger class, alert idle stance. Wears a dark olive green cloak, patched tan leather armor, quiver with red fletched arrows, crude recurve bow. Color identity: olive greens, tan leather, rust red.
```

Palette:
```
#161a0e #2e3a18 #4c5e2a #6e8040 #5e3f24 #8f6638 #c49a62 #b8452a #8a8a4a #686a34 #464822 #e4dcc0 #4a3020
```

## Rogue

### Human Rogue

Prompt:
```
Pixel art fantasy RPG character of a human woman, pale skin, short red hair, rogue class, low crouched sneaky stance. Wears tight charcoal leather armor, a dark plum purple hood and face scarf, small belts and pouches, two short steel daggers. Color identity: charcoal blacks, plum purple, cold steel.
```

Palette:
```
#0e0c12 #1e1c24 #34303c #555060 #3e1a40 #6e2c6e #a050a0 #c8c8d0 #f4d4c0 #dcae96 #a87c66 #c4482a #82281a
```

### Elf Rogue

Prompt:
```
Pixel art fantasy RPG character of a dark elf, deep slate skin, long pointed ears, short silver hair, rogue class, low crouched sneaky stance. Wears midnight blue leather armor, black hood and mask, silver buckles, two slender curved daggers with a faint blue shine. Color identity: midnight blue, black, silver.
```

Palette:
```
#0a0c14 #161c2e #243050 #3a4c7a #0e0e12 #8a92a8 #c8d0dc #5a9ad8 #5a5e74 #3e4256 #2a2c3c #d0d4dc #9094a4
```

### Dwarf Rogue

Prompt:
```
Pixel art fantasy RPG character of a dwarf, short and stocky, pale freckled skin, trimmed auburn beard, rogue class, low crouched sneaky stance. Wears dark brown leather armor with many belts and pouches, black hood, red scarf, short steel dagger and lockpicks. Color identity: dark browns, red scarf, steel.
```

Palette:
```
#0e0a08 #241a12 #3e2c1e #5e4430 #6a1416 #a82428 #c8c8d0 #8a8a92 #f0c4a6 #d09c80 #9c7058 #9a4422 #5e2810
```

### Orc Rogue

Prompt:
```
Pixel art fantasy RPG character of an orc, dark teal-green skin, small lower tusks, shaved sides and black ponytail, rogue class, low crouched sneaky stance. Wears charcoal leather armor, a dark plum hood and face scarf, bone-handled daggers. Color identity: charcoal, plum purple, bone.
```

Palette:
```
#0e0c12 #1e1c24 #34303c #555060 #3e1a40 #6e2c6e #a050a0 #d8ccb0 #4e7a6a #365a4c #223c32 #e8e0c8 #121014
```

## Druid

### Human Druid

Prompt:
```
Pixel art fantasy RPG character of a human, deep brown skin, gray dreadlocks, druid class, grounded relaxed stance. Wears earthy brown robes wrapped with bright leaf vines, a crown of antlers and leaves with pink blossoms, twisted wooden staff sprouting leaves. Color identity: bark browns, vivid leaf green, blossom pink.
```

Palette:
```
#1a120c #4e3420 #7c5634 #4a8a2a #84c83a #c8f070 #e86aa0 #f4b8d0 #6e4630 #52321e #362012 #9a9690 #6a6660
```

### Elf Druid

Prompt:
```
Pixel art fantasy RPG character of a wood elf, olive skin, long pointed ears, long moss-green hair, druid class, grounded relaxed stance. Wears pale green and white leaf-woven robes, a crown of white flowers, slender living-wood staff with glowing yellow blossoms. Color identity: pale greens, white, golden yellow blossoms.
```

Palette:
```
#141a10 #3e5a2a #6a9a42 #a8d478 #e8f4dc #8a6a44 #f0d040 #fff4a0 #d4b88e #b0966c #7e6a4a #5e8a3a #3a5a22
```

### Dwarf Druid

Prompt:
```
Pixel art fantasy RPG character of a dwarf, short and stocky, dark brown skin, long gray beard braided with twigs, druid class, grounded relaxed stance. Wears dark brown robes with moss patches, an antler hood, gnarled root staff with glowing blue mushrooms. Color identity: dark browns, moss green, glowing blue.
```

Palette:
```
#120e0a #3a2818 #5e4228 #4a6a2a #7a9a3e #c8b890 #3a8ad8 #8ad4ff #8a5a3e #684028 #462a18 #b4b0a8 #7c7870
```

### Orc Druid

Prompt:
```
Pixel art fantasy RPG character of an orc, yellow-green skin, lower tusks, long brown hair with leaves, druid class, grounded relaxed stance. Wears bark brown hide robes wrapped in leaf vines, antler headdress with red berries, twisted wooden staff sprouting leaves. Color identity: bark browns, leaf green, berry red.
```

Palette:
```
#1a120c #4e3420 #7c5634 #4a8a2a #84c83a #c8f070 #a82a2a #e05a4a #a4b04e #7e8a36 #565e22 #ece4c8 #5a3a22
```

## Warlock

### Human Warlock

Prompt:
```
Pixel art fantasy RPG character of a human man, sallow pale skin, slicked-back black hair with a streak of white, goatee, warlock class, defiant casting pose. Wears a wine-red and black high-collared coat with tarnished gold clasps, small curved horn shoulder pieces, one hand wreathed in magenta hellfire, a grimoire chained to the belt. Color identity: wine red, black, infernal magenta.
```

Palette:
```
#0e080c #26101a #4e1428 #7e1e3c #a8803a #d8b45a #8a1a6a #d42a98 #ff8ad0 #ffe0f0 #ecd0bc #c4a08c #8c6c5c
```

### Elf Warlock

Prompt:
```
Pixel art fantasy RPG character of an elf, pale lavender-tinted skin, long pointed ears, long jet-black hair, glowing amber eyes, warlock class, defiant casting pose. Wears sleek charcoal and deep burnt-orange robes with fine gold chains and sigil tattoos on the hands, a cursed dagger in one hand and swirling ember-orange fire in the other. Color identity: charcoal, burnt orange, ember glow.
```

Palette:
```
#0c0a0c #24201e #403a38 #6a625c #8a3a10 #cc5a1a #ff9a2a #ffd870 #fff0c0 #e4d0dc #bca4b4 #8c7488 #c8a040
```

### Dwarf Warlock

Prompt:
```
Pixel art fantasy RPG character of a dwarf, short and stocky, ruddy soot-stained skin, thick black beard with ash-gray streaks, warlock class, defiant casting pose. Wears blackened plate bracers and a heavy hooded cloak of dark plum, a chained iron tome, small horned imp perched on the shoulder, violet-pink flames around the fist. Color identity: soot black, dark plum, hot pink-violet fire.
```

Palette:
```
#0a080c #1c1620 #34283c #52405c #7a8088 #4a1a5a #8a2aa8 #d85ae8 #ffb0f4 #d49478 #a86a54 #7a4638 #2a2024
```

### Orc Warlock

Prompt:
```
Pixel art fantasy RPG character of an orc, gray-brown skin with glowing red-violet scars, broken lower tusks, bald with black tattoos on the scalp, warlock class, defiant casting pose. Wears ragged blood-red and black leather robes, spiked iron collar, bone horns on the shoulders, a jagged black staff crackling with magenta hellfire. Color identity: blood red, black, magenta hellfire.
```

Palette:
```
#0c0608 #20101a #3c1420 #6e1a2c #a82a38 #8a1a6a #d42a98 #ff8ad0 #ecdcc0 #8c8070 #6c6256 #4a4238 #1a1418
```

## Shaman

### Human Shaman

Prompt:
```
Pixel art fantasy RPG character of a human woman, warm bronze skin, long black hair in thin braids with beads and feathers, shaman class, chanting idle pose. Wears a sand-colored hide tunic with turquoise bead trim, an eagle-feather mantle, white clay marks on the face and arms, a totem staff with a hawk skull and hanging feathers, small blue-white lightning arcing between the fingers. Color identity: sand tan, turquoise, storm-blue lightning.
```

Palette:
```
#1c1410 #5a4228 #8e6a40 #c8a468 #ece0c0 #1a7a7e #3ab8b4 #6ad0ff #e8f8ff #c88e5e #9c6a42 #6a4228 #1a1214
```

### Elf Shaman

Prompt:
```
Pixel art fantasy RPG character of a wood elf, deep amber skin, long pointed ears, shaved sides with a long dark-red braid, shaman class, chanting idle pose. Wears layered rust-red and ochre cloth wraps with copper bangles, a mask of carved wood pushed up on the head, a gnarled staff topped with a glowing spirit-orb and a pale spirit fox of fire at the feet. Color identity: rust red, ochre, copper, spirit-orange glow.
```

Palette:
```
#1a0e0c #4a1c14 #7e2e1c #b0522a #d8923a #f0cc70 #b8703a #7a4a28 #ff7a2a #ffd890 #c8864e #a0623a #6c3e24
```

### Dwarf Shaman

Prompt:
```
Pixel art fantasy RPG character of a dwarf, short and stocky, gray-brown skin, long silver beard braided with stone and iron beads, shaman class, chanting idle pose. Wears slate-gray stone-plated shoulder armor over a moss-green hide robe, glowing yellow-green rune scars on the arms, a staff topped with a floating boulder crackling with earth energy. Color identity: slate gray, moss green, glowing rune yellow-green.
```

Palette:
```
#101210 #2c3030 #4c5456 #7a8688 #aab6b6 #34502a #5e8a3c #b8e04a #eaff9a #b49480 #8c6c5a #605040 #d8d8d0
```

### Orc Shaman

Prompt:
```
Pixel art fantasy RPG character of an orc, mossy green skin with red and white war paint spirals, large lower tusks, wild dark hair with bones and teeth, shaman class, chanting idle pose. Wears a tattered wolf pelt over a dark blue-gray hide skirt, bone and talisman necklaces, a tall skull-topped totem staff with a swirling blue-white storm cloud and small lightning bolts. Color identity: dark blue-gray, pelt gray, storm-blue lightning.
```

Palette:
```
#0e1014 #242a36 #3e485c #5e6a82 #8a8e96 #4a9aea #9ad4ff #f0fbff #d8d0b8 #6e8e46 #4e6a30 #344a22 #b82a2a
```
