import type { Player } from "./room-activity";
import { Game } from "./room-game";
import type { Room } from "./rooms";
import type { GameDifficulty, IUserHostedFile, IUserHostedFormat } from "./types/games";
import type { User } from "./users";

const FIRST_ACTIVITY_WARNING = 5 * 60 * 1000;
const SECOND_ACTIVITY_WARNING = 30 * 1000;
const MIN_HOST_EXTENSION_MINUTES = 1;
const MAX_HOST_EXTENSION_MINUTES = 2;
const FORCE_END_CREATE_TIMER = 60 * 1000;
const HOST_TIME_LIMIT = 25 * 60 * 1000;

export class UserHostedGame extends Game {
	endTime: number = 0;
	extended: boolean = false;
	gameTimer: NodeJS.Timer | null = null;
	gameTimerEndTime: number = 0;
	hostId: string = '';
	hostName: string = '';
	hostTimeout: NodeJS.Timer | null = null;
	isUserHosted: boolean = true;
	mascots: string[] = [];
	noControlPanel: boolean = false;
	notifyRankSignups: boolean = true;
	readonly points = new Map<Player, number>();
	savedWinners: Player[] = [];
	scoreCap: number = 0;
	shinyMascot: boolean = false;
	showSignupsHtml = true;
	storedMessages: Dict<string> | null = null;
	subHostId: string | null = null;
	subHostName: string | null = null;
	twist: string | null = null;

	// set in onInitialize()
	format!: IUserHostedFormat;

	room!: Room;

	reset(): void {
		if (this.timeout) {
			clearTimeout(this.timeout);
			this.timeout = null;
		}

		if (this.gameTimer) {
			clearTimeout(this.gameTimer);
			this.gameTimer = null;
		}

		if (this.hostTimeout) {
			clearTimeout(this.hostTimeout);
			this.hostTimeout = null;
		}

		if (this.startTimer) {
			clearTimeout(this.startTimer);
			this.startTimer = null;
		}

		if (this.signupsHtmlTimeout) {
			clearTimeout(this.signupsHtmlTimeout);
			this.signupsHtmlTimeout = null;
		}

		this.clearHangman();
		this.clearSignupsNotification();

		this.endTime = 0;
		this.mascots = [];
		this.points.clear();
		this.savedWinners = [];
		this.scoreCap = 0;
		this.shinyMascot = false;
		this.storedMessages = null;
		this.subHostId = null;
		this.subHostName = null;
		this.twist = null;

		this.started = false;
		this.startTime = 0;
		this.minPlayers = 4;
		this.players = {};
		this.playerCount = 0;
		this.teams = null;
	}

	restart(format: IUserHostedFormat): void {
		this.reset();

		this.onInitialize(format);
		this.id = format.id;
		this.description = format.description;

		this.setHost(this.hostName);
		this.signups();
	}

	extend(target: string, user: User): string | undefined {
		if (this.extended) return "The game cannot be extended more than once.";

		const now = Date.now();
		if (this.endTime - now > FIRST_ACTIVITY_WARNING) {
			return "You cannot extend the game if there are more than " + (FIRST_ACTIVITY_WARNING / 60 / 1000) + " minutes remaining.";
		}

		const minutes = parseFloat(target);
		if (isNaN(minutes) || minutes < MIN_HOST_EXTENSION_MINUTES || minutes > MAX_HOST_EXTENSION_MINUTES) {
			return "You must specify an extension time between " + MIN_HOST_EXTENSION_MINUTES + " and " +
				MAX_HOST_EXTENSION_MINUTES + " minutes.";
		}

		this.endTime += minutes * 60 * 1000;
		this.extended = true;
		this.setSecondActivityTimer();

		const extension = minutes + " minute" + (minutes === 1 ? "" : "s");
		this.say((this.subHostName || this.hostName) + " your game has been extended by " + extension + ".");
		if (!this.subHostName) this.room.modnote(user.name + " extended " + this.hostName + "'s game by " + extension + ".");
	}

	// Display
	getMascotAndNameHtml(additionalText?: string): string {
		const icons: string[] = [];
		for (const mascot of this.mascots) {
			const icon = Dex.getPokemonIcon(Dex.getExistingPokemon(mascot));
			if (icon) icons.push(icon);
		}
		return icons.join("") + "<b>" + this.name + (additionalText || "") + "</b>";
	}

	// Host
	setHost(host: User | string, noControlPanel?: boolean): void {
		if (typeof host === 'string') {
			this.hostId = Tools.toId(host);
			this.hostName = host;
		} else {
			this.hostId = host.id;
			this.hostName = host.name;
		}

		this.mascots = [];
		const database = Storage.getDatabase(this.room);
		if (database.gameHostBoxes && this.hostId in database.gameHostBoxes && Config.showGameHostBoxes &&
			Config.showGameHostBoxes.includes(this.room.id)) {
			for (const choice of database.gameHostBoxes[this.hostId].pokemon) {
				const pokemon = Dex.getPokemon(choice.pokemon);
				if (pokemon) {
					this.mascots.push(pokemon.name);
				}
			}
		}

		if (this.mascots.length) {
			const mascotPrefix = Games.getFormatMascotPrefix(this.format);
			let formatName = this.format.name;
			if (mascotPrefix) {
				let team = false;
				if (formatName.startsWith("Team ")) {
					team = true;
					formatName = formatName.substr(5);
				}

				formatName = formatName.substr(mascotPrefix.length);
				if (team) formatName = "Team " + formatName;
			}

			this.name = this.hostName + "'s " + formatName;
		} else {
			this.name = this.hostName + "'s " + this.format.name;
		}

		if (noControlPanel) {
			this.noControlPanel = true;
		} else {
			this.sendControlPanelButton();
		}
	}

	setSubHost(user: User): void {
		this.subHostId = user.id;
		this.subHostName = user.name;

		this.sendControlPanelButton();
	}

	sendControlPanelButton(): void {
		if (this.noControlPanel) return;

		const user = Users.get(this.subHostName || this.hostName);
		if (user) {
			this.room.pmHtml(user, "To assist with your game, try using the <b>Host Control Panel</b>! It allows you to manage " +
				"attributes of your game, display trainers & Pokemon, and generate hints.<br /><br />" +
				Client.getPmSelfButton(Config.commandCharacter + "gamehostcontrolpanel " + this.room.title, "Open panel"));
		}
	}

	autoRefreshControlPanel(): void {
		if (this.noControlPanel) return;

		const user = Users.get(this.subHostName || this.hostName);
		if (user) {
			CommandParser.parse(user, user, Config.commandCharacter + "gamehostcontrolpanel " + this.room.title + ", autorefresh",
				Date.now());
		}
	}

	closeControlPanel(): void {
		if (this.noControlPanel) return;

		const user = Users.get(this.subHostName || this.hostName);
		if (user) {
			CommandParser.parse(user, user, Config.commandCharacter + "gamehostcontrolpanel " + this.room.title + ", close",
				Date.now());
		}
	}

	isHost(user: User): boolean {
		if (user.id === this.hostId || (this.subHostId && user.id === this.subHostId)) return true;
		return false;
	}

	useHostCommand(command: string, target?: string): void {
		this.parseCommand(this.subHostName || this.hostName, command, target);
	}

	setStartTimer(minutes: number): void {
		if (this.startTimer) clearTimeout(this.startTimer);
		this.startTimer = setTimeout(() => this.useHostCommand('startgame'), minutes * 60 * 1000);
	}

	// Players
	addPlayer(user: User): Player | undefined {
		if (this.format.options.freejoin) {
			if (!this.joinNotices.has(user.id)) {
				user.say("This game does not require you to join.");
				this.joinNotices.add(user.id);
			}
			return;
		}

		if (this.started) return;

		const player = this.createPlayer(user);
		if (!player) return;

		if (!this.joinNotices.has(user.id)) {
			player.say("Thanks for joining " + this.name + " " + this.activityType + "!");
			this.joinNotices.add(user.id);
		}

		if (!this.signupsHtmlTimeout) {
			this.signupsHtmlTimeout = setTimeout(() => {
				this.sayUhtmlChange(this.signupsUhtmlName, this.getSignupsPlayersHtml());
				this.signupsHtmlTimeout = null;
			}, this.getSignupsUpdateDelay());
		}

		if (this.playerCap && this.playerCount >= this.playerCap) this.start();

		return player;
	}

	removePlayer(user: User | string, silent?: boolean): void {
		const player = this.destroyPlayer(user);
		if (!player) return;

		const id = typeof user === 'string' ? Tools.toId(user) : user.id;
		if (!silent && !this.leaveNotices.has(id)) {
			player.say("You have left " + this.name + " " + this.activityType + ". You will not receive any further signups messages.");
			this.leaveNotices.add(id);
		}

		if (this.format.options.freejoin) return;

		if (!this.started) {
			if (!this.signupsHtmlTimeout) {
				this.signupsHtmlTimeout = setTimeout(() => {
					this.sayUhtmlChange(this.signupsUhtmlName, this.getSignupsPlayersHtml());
					this.signupsHtmlTimeout = null;
				}, this.getSignupsUpdateDelay());
			}
		}
	}

	splitPlayers(teams: number, teamNames?: string[]): void {
		this.teams = this.generateTeams(teams, teamNames);
		for (const i in this.teams) {
			const team = this.teams[i];
			for (const player of team.players) {
				const points = this.points.get(player);
				if (points) team.points += points;
			}
		}
	}

	unSplitPlayers(): void {
		for (const i in this.teams) {
			const team = this.teams[i];
			for (const player of team.players) {
				delete player.team;
			}
		}

		this.teams = null;
	}

	setUhtmlBaseName(): void {
		const database = Storage.getDatabase(this.room);
		if (!database.userHostedGameCounts) database.userHostedGameCounts = {};
		if (!(this.format.id in database.userHostedGameCounts)) database.userHostedGameCounts[this.format.id] = 0;
		database.userHostedGameCounts[this.format.id]++;

		this.uhtmlBaseName = "userhosted-" + this.format.id + "-" + database.userHostedGameCounts[this.format.id];
		this.signupsUhtmlName = this.uhtmlBaseName + "-signups";
		this.joinLeaveButtonUhtmlName = this.uhtmlBaseName + "-join-leave";
	}

	// Game lifecycle
	onInitialize(format: IUserHostedFormat): void {
		this.format = format;
		this.setUhtmlBaseName();

		this.endTime = Date.now() + HOST_TIME_LIMIT;
		if (this.format.link) this.format.description += "<br /><br /><b><a href='" + this.format.link + "'>More info</a></b>";
		if (this.format.freejoin) {
			this.format.options.freejoin = 1;
			this.minPlayers = 0;
		}
	}

	getHighlightPhrase(): string {
		return Games.getUserHostedGameHighlight() + " " + this.id;
	}

	getSignupsHtml(): string {
		return Games.getHostBoxHtml(this.room, this.hostName, this.name, this.format, this.getHighlightPhrase());
	}

	signups(): void {
		this.signupsTime = Date.now();
		this.signupsStarted = true;

		const database = Storage.getDatabase(this.room);
		if (database.gameHostBoxes && this.hostId in database.gameHostBoxes) {
			const box = database.gameHostBoxes[this.hostId];
			this.customBackgroundColor = box.signupsBackground || box.background;
			this.customButtonColor = box.signupsButtons || box.buttons;
		}

		this.sayHtml(this.getSignupsHtml());
		if (!this.format.options.freejoin) this.sayUhtml(this.signupsUhtmlName, this.getSignupsPlayersHtml());
		this.sayUhtml(this.joinLeaveButtonUhtmlName, this.getJoinLeaveHtml(this.format.options.freejoin ? true : false));

		this.room.notifyRank("all", this.room.title + " user-hosted game", this.name, this.hostId + " " + this.getHighlightPhrase());

		this.hostTimeout = setTimeout(() => {
			this.say((this.subHostName || this.hostName) + " there are " + Tools.toDurationString(FIRST_ACTIVITY_WARNING) + " remaining " +
				"in the game!");
			this.setSecondActivityTimer();
		}, HOST_TIME_LIMIT - FIRST_ACTIVITY_WARNING);

		if (this.format.options.freejoin) {
			this.started = true;
			this.startTime = Date.now();
		}
	}

	start(isAuth?: boolean): boolean {
		if (this.started || (this.minPlayers && !isAuth && this.playerCount < this.minPlayers)) return false;

		if (this.startTimer) clearTimeout(this.startTimer);
		if (this.signupsHtmlTimeout) clearTimeout(this.signupsHtmlTimeout);

		this.started = true;
		this.startTime = Date.now();
		this.room.notifyOffRank("all");
		this.sayUhtmlChange(this.joinLeaveButtonUhtmlName, this.getSignupsEndMessage());
		this.say(this.name + " is starting! **Players (" + this.playerCount + ")**: " + this.getPlayerNames());

		return true;
	}

	setSecondActivityTimer(): void {
		if (this.hostTimeout) clearTimeout(this.hostTimeout);
		this.hostTimeout = setTimeout(() => {
			this.say((this.subHostName || this.hostName) + " you have " + Tools.toDurationString(SECOND_ACTIVITY_WARNING) + " to " +
				"declare the winner(s) with ``" + Config.commandCharacter + "win [winner]`` or ``" +
				Config.commandCharacter + "autowin [places]``!");
			this.hostTimeout = setTimeout(() => {
				this.say((this.subHostName || this.hostName) + " your time is up!");
				this.end();
			}, SECOND_ACTIVITY_WARNING);
		}, this.endTime - Date.now() - SECOND_ACTIVITY_WARNING);
	}

	end(): void {
		if (this.ended) throw new Error("Game already ended");
		this.ended = true;

		const now = Date.now();
		Games.setLastUserHostTime(this.room, this.hostId, now);

		// possibly customized name attribute
		Games.setLastUserHostFormatTime(this.room, Tools.toId(this.format.name), now);

		const database = Storage.getDatabase(this.room);
		if (!this.subHostName) {
			if (!database.userHostedGameStats) database.userHostedGameStats = {};
			if (!(this.hostId in database.userHostedGameStats)) database.userHostedGameStats[this.hostId] = [];
			database.userHostedGameStats[this.hostId].push({
				endTime: now,
				format: this.format.name,
				inputTarget: this.format.inputTarget,
				startingPlayerCount: this.playerCount,
				endingPlayerCount: this.getRemainingPlayerCount(),
				startTime: this.signupsTime,
				winners: Array.from(this.winners.keys()).map(x => x.id),
			});
		}

		Games.setLastGame(this.room, now);
		Games.setLastUserHostedGame(this.room, now);
		database.lastUserHostedGameTime = now;

		if (!database.lastUserHostedGameFormatTimes) database.lastUserHostedGameFormatTimes = {};
		database.lastUserHostedGameFormatTimes[this.format.id] = now;

		if (!database.pastUserHostedGames) database.pastUserHostedGames = [];
		database.pastUserHostedGames.unshift({inputTarget: this.format.inputTarget, name: this.name, time: now});
		while (database.pastUserHostedGames.length > 8) {
			database.pastUserHostedGames.pop();
		}

		Storage.addPoints(this.room, Storage.gameHostingLeaderboard, this.subHostName || this.hostName, 1, this.format.id);

		if (Config.rankedGames && Config.rankedGames.includes(this.room.id)) {
			let hostDifficulty: GameDifficulty;
			if (Config.userHostedGameHostDifficulties && this.format.id in Config.userHostedGameHostDifficulties) {
				hostDifficulty = Config.userHostedGameHostDifficulties[this.format.id];
			} else {
				hostDifficulty = 'medium';
			}

			let hostBits = 300;
			if (hostDifficulty === 'medium') {
				hostBits = 400;
			} else if (hostDifficulty === 'hard') {
				hostBits = 500;
			}

			let hostName = this.hostName;
			if (this.subHostName) {
				hostName = this.subHostName;
				hostBits /= 2;
			}

			// eslint-disable-next-line @typescript-eslint/no-extra-parens
			if (Config.afd) hostBits *= (this.random(50) + 1);

			if (Config.onUserHostedGameHost) Config.onUserHostedGameHost(this.room, this.format, hostName);

			Storage.addPoints(this.room, Storage.gameLeaderboard, hostName, hostBits, 'userhosted');
			const user = Users.get(hostName);
			if (user) {
				user.say("You were awarded " + hostBits + " bits! To see your total amount, use this command: ``" +
					Config.commandCharacter + "bits " + this.room.title + "``. Thanks for your efforts, we hope you host again soon!");
			}
		}

		this.setCooldownAndAutoCreate('scripted');

		this.deallocate(false);
	}

	forceEnd(user: User, reason?: string): void {
		Games.removeLastUserHostTime(this.room, this.hostId);
		this.say(this.name + " " + this.activityType + " was forcibly ended!");
		this.room.modnote(this.name + " was forcibly ended by " + user.name + (reason ? " (" + reason + ")" : ""));
		this.deallocate(true);
	}

	clearHangman(): void {
		if (this.room.serverHangman) this.room.endHangman();
	}

	clearSignupsNotification(): void {
		if (!this.started || this.format.options.freejoin) this.room.notifyOffRank("all");
	}

	deallocate(forceEnd: boolean): void {
		if (!this.ended) this.ended = true;

		this.cleanupMessageListeners();
		if (this.timeout) clearTimeout(this.timeout);
		if (this.startTimer) clearTimeout(this.startTimer);
		if (this.gameTimer) clearTimeout(this.gameTimer);
		if (this.hostTimeout) clearTimeout(this.hostTimeout);

		if (this.room.userHostedGame === this) delete this.room.userHostedGame;

		this.clearHangman();
		this.clearSignupsNotification();
		this.closeControlPanel();

		if (forceEnd && Config.gameAutoCreateTimers && this.room.id in Config.gameAutoCreateTimers) {
			Games.setAutoCreateTimer(this.room, 'userhosted', FORCE_END_CREATE_TIMER);
		}
	}
}

export const game: IUserHostedFile = {
	class: UserHostedGame,
	formats: [
		{
			name: "Floette's Forum Game",
			description: "A game from Game Corner's official forum.",
			aliases: ['ffg'],
			customizableAttributes: ['name', 'link'],
		},
		{
			name: "Acrotopia",
			description: "Each round, players earn points by coming up with creative interpretations of an acronym chosen by the host",
			freejoin: true,
		},
		{
			name: "Battle Maison",
			aliases: ['bm'],
			description: "A tournament style game where each player is given a Pokemon to battle with in [Gen " + Dex.getGen() + "] OU. " +
				"Defeating an opponent allows the player to add the opponent's Pokemon to his or her team. This continues until there " +
				"is only one player left standing!",
		},
		{
			name: "Commonyms",
			description: "Players must find the word that applies to all of the words in the puzzle Ex: sky, jay, sad | Answer: blue",
			freejoin: true,
		},
		{
			name: "Ditto's Who Am I",
			mascot: 'Ditto',
			aliases: ['dittos', 'who am i'],
			description: "The host will assign each player a Pokemon without telling them. Each round, players must ask 'yes' or 'no' " +
				"questions in order to guess what Pokemon they were assigned!",
		},
		{
			name: "Dugtrio's Dex Entries",
			mascot: "Dugtrio",
			aliases: ['DDE'],
			description: "Each round, players create a brand new Pokedex entry for each Pokemon the host presents. Entries are judged by " +
				"creativity and originality.",
			freejoin: true,
		},
		{
			name: "Gameathlon",
			description: "A series of Game Corner games in one! Players try to win each mini-game to earn points.",
			freejoin: true,
		},
		{
			name: "Ghost",
			description: "Each player adds a letter to a string of letters while trying not to form an English word on their turn. If a " +
				"word is formed, that player is eliminated. Players may challenge the previous player for elimination if there is no " +
				"word that can be formed from the existing string.",
		},
		{
			name: "Guess That Auth",
			description: "Players guess users that have matching global and room auth as the lists presented by the host.",
			aliases: ['gta'],
			freejoin: true,
		},
		{
			name: "Hunger Games",
			description: "This is a game of storytelling, decision-making, swift responses, and chance! The host will create a scenario " +
				"in which players have to choose their paths and overcome obstacles to be the last one standing.",
			aliases: ['hg'],
			approvedHostOnly: true,
		},
		{
			name: "Jynx's Klutzy Kissing",
			mascot: "Jynx",
			aliases: ['JKK'],
			description: "Kiss the Pokemon with gender differences to win! Use the command <code>" + Config.commandCharacter + "kiss" +
				"</code> on the Pokemon you believe has different sprites when it is female or male.",
			freejoin: true,
		},
		{
			name: "Letter Getter",
			description: "In this game, players must complete the phrase with the given letters and (optional) numbers. Example: <i>26 L " +
				"of the A</i> would be <i>26 Letters of the Alphabet</i>.",
			freejoin: true,
		},
		{
			name: "Luig-E's Challenge",
			aliases: ['Luiges'],
			description: "Each round, the players decide to either attack, counter or rest to take down Luig-E. However, Luig-E picks a " +
				"move and can attack too, so be careful with your picks!",
		},
		{
			name: "Lyrics",
			description: "Players have to guess the names and singers of songs based on lyrics presented by the host.",
			freejoin: true,
		},
		{
			name: "Mad Gabs",
			description: "The host gives the pronunciation of a word and players have to correctly identify the word to score points.",
			freejoin: true,
		},
		{
			name: "Mareep's Counting Sheep",
			mascot: "Mareep",
			aliases: ['mareeps', 'counting'],
			description: "Players have to do " + Config.commandCharacter + "count in the right order based on the given category " +
				"(numbers, words or etc.). The first person to mess up the sequence loses a point, so be careful!",
		},
		{
			name: "Mascots",
			description: "Each round, the host will provide a song and players must find a Pokemon that best represents it using the " +
				"standard formatting --[Pokemon]--.",
			freejoin: true,
		},
		{
			name: "Mega Mania",
			description: "Each round, players make mega evolutions for a Pokemon given by the host. Entries are judged on creativity " +
				"and viability made through typing, stats, and abilities.",
			freejoin: true,
		},
		{
			name: "Metagross' Mind Mash",
			mascot: "Metagross",
			aliases: ['mmm', 'metagrosssmindmash'],
			description: "Players answer riddles within the time limit to survive each round!",
			freejoin: true,
		},
		{
			name: "Mimics",
			description: "Be the 2nd player to say the host's phrase exactly! Use deception to trick competitors into saying the " +
				"host's phrase to earn points. Formatting does not count unless stated otherwise by the host.",
			freejoin: true,
		},
		{
			name: "Necturna's Move Tutor",
			description: "Each round, players create a move of a type chosen by the host. Entries are judged on creativity and " +
				"viability based on base power, PP, and secondary effects.",
			freejoin: true,
		},
		{
			name: "Nickgames",
			description: "Each round, the host will announce a Pokemon and players must create the most funny, clever, cute, creative, " +
				"or fitting nickname for it using the standard formatting --[nickname]--.",
			freejoin: true,
		},
		{
			name: "Pachirisu's Picking Process",
			mascot: 'Pachirisu',
			aliases: ['pachirisus'],
			description: "A random Pokemon is displayed by the host and the players have to either recommend or not recommend it. " +
				"Then, the host will display another random Pokemon. If the 1st Pokemon wins type-wise, the players that recommended " +
				"it win a point and vice-versa!",
			freejoin: true,
		},
		{
			name: "Porygon's Movesearch Match",
			mascot: "Porygon",
			description: "Players guess Pokemon based on the given movesets!",
			aliases: ['porygons', 'pmm'],
			freejoin: true,
		},
		{
			name: "Precise Timing",
			aliases: ['pt'],
			description: "Each round, the host will set a timer and players must do <code>/me check</code> before time runs out. The " +
				"catch: the first one to check in is eliminated.",
		},
		{
			name: "Private Objects",
			description: "Each round, the host selects a topic, and players have to PM the host with an answer. The host selects a " +
				"response and players will have to identify the respondent to gain points. If no one manages to correctly identify " +
				"the player, that player will instead get the point.",
			aliases: ['po'],
		},
		{
			name: "Probopass' Letter Station",
			mascot: "Probopass",
			description: "A letter is picked and players have to name something that starts with that letter that also matches the " +
				"given parameters!",
			aliases: ['PLS'],
			freejoin: true,
		},
		{
			name: "Pun Game",
			description: "Players make creative puns referencing the Pokemon selected by the host to score points.",
			freejoin: true,
		},
		{
			name: "Rapid CAP",
			description: "Each round, players will create Pokemon based on the typing given by the host, including the species, name, " +
				"and ability(ies) in their answers. Dex entries are not required, but may give a player an edge over the rest of the " +
				"competition.",
			freejoin: true,
		},
		{
			name: "Rock Paras Scizor",
			aliases: ["RPS"],
			description: "A Pokemon themed rock paper scissors tournament where typings determine the winner. PM a Pokemon to the host " +
				"in hopes of having a type advantage over your opponent. More info: " +
				"https://docs.google.com/document/d/1H6bRZlxJSfNZvqzxnbTyV2RiXABtuVgZdprTNEfn6bk",
		},
		{
			name: "Rotom's Dex Trivia",
			mascot: "Rotom",
			description: "A dex entry of a Pokemon will be posted and players have to be first to guess the Pokemon correctly!",
			aliases: ['RDT', 'rotomdexstrivia', 'dextrivia'],
			freejoin: true,
		},
		{
			name: "Scizor's Clock Tower",
			mascot: "Scizor",
			aliases: ['Clock Tower', 'Scizors'],
			description: "Evade the Scizor as it tries to capture the players by selecting their doors and capturing its prey by being " +
				"faster than them in a series of minigames! " +
				"<a href='https://www.tapatalk.com/groups/ps_game_corner/scizor-39-s-clock-tower-t803.html'>More info</a>",
		},
		{
			name: "Scyther's Message Slide",
			mascot: "Scyther",
			description: "Players have to PM the host. Depending on the order in which they PMed, they can win or lose points!",
			aliases: ['SMS'],
			freejoin: true,
		},
		{
			name: "Similarities",
			description: "Each round, the host names three objects (Pokemon related or not) and players must guess what the similarity " +
				"between the three is.",
			freejoin: true,
		},
		{
			name: "Simon Says",
			description: "Each round, the host will announce an action. If the action is preceded by 'Simon Says', players must do the " +
				"action using <code>/me [action]</code>. If players do the action when it is not preceded by 'Simon Says', they are " +
				"eliminated.",
		},
		{
			name: "Spot The Reference",
			description: "Players must identify the source (who said it, movie/tv show title, etc.) of a quote",
			aliases: ['str'],
			freejoin: true,
		},
		{
			name: "Spyfall",
			description: "Each player is sent the location for the game and a unique job. If a player is chosen to be the spy, only they " +
				"will know and they will not receive the location. By asking questions in turns, the spy tries to guess the location and " +
				"the other players try to discover the spy.",
		},
		{
			name: "The Chosen One",
			description: "The host PMs a selected player three words. A timer is set and all players have a conversation in the chat, in " +
				"which the selected player must use all three words. After the timer ends, all players PM the host who they think was " +
				"The Chosen One.",
			aliases: ['tco', 'chosenone'],
		},
		{
			name: "The Evo Game",
			description: "Each round, the host will announce a Pokemon and players must create an evolution, providing the species, " +
				"typing, ability(ies), and dex entry.",
			aliases: ['evogame'],
			freejoin: true,
		},
		{
			name: "The Missing Link",
			description: "Players must find the missing word that completes both phrases! Example: Key _ Reaction (Chain)",
			aliases: ['missinglink', 'tml'],
			freejoin: true,
		},
		{
			name: "Two Truths and a Lie",
			description: "Each round, the host presents the players with three statements. Players have to correctly identify the lie " +
				"to score points.",
			aliases: ['ttal', 'ttaal'],
			freejoin: true,
		},
		{
			name: "Voltorb's Tricks",
			mascot: "Voltorb",
			description: "Players try to win each mini-game to get a chance of catching opponents with a randomly chosen Poke Ball. " +
				"Each Poke Ball has a different catch rate, and getting a Voltorb (or Electrode) may result in your own elimination!",
			aliases: ['voltorbs', 'vt'],
		},
		{
			name: "Weavile's Wicked Battlegrounds",
			mascot: "Weavile",
			description: "Each round, one player PMs the host a move while the other players PM the host a Pokemon. If a player's " +
				"Pokemon resists the move or is immune to it, they win points. However, the more picked Pokemon the move hits super " +
				"effectively, the more points the user gets.",
			aliases: ['WWB'],
		},
		{
			name: "20 Questions",
			description: "The host will choose either a Pokemon or real world object and players take turns asking yes/no questions to " +
				"figure out what it is. The game ends if no one guesses correctly after 20 questions!",
			aliases: ['20q', '20qs'],
		},
	],
};
