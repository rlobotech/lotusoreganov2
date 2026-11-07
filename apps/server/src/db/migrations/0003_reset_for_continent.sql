-- The world is now a 40 by 40 continent with new regions, sites and quests, so parties saved on
-- the old map (14 by 60) no longer fit. The game is pre-release: they are removed (their
-- characters, replays and orders go with them) and players form a new party.
DELETE FROM parties;
