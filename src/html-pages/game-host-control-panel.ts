import type { Room } from "../rooms";
import type { BaseCommandDefinitions } from "../types/command-parser";
import type { ModelGeneration } from "../types/dex";
import type { IRandomGameAnswer } from "../types/games";
import type { HexCode } from "../types/tools";
import type { User } from "../users";
import type { IColorPick } from "./components/color-picker";
import { ManualHostDisplay } from "./components/manual-host-display";
import type { IHostDisplayProps } from "./components/host-display-base";
import type { IPokemonPick } from "./components/pokemon-picker-base";
import { RandomHostDisplay } from "./components/random-host-display";
import type { ITrainerPick } from "./components/trainer-picker";
import { HtmlPageBase } from "./html-page-base";
import { MultiTextInput } from "./components/multi-text-input";
import { TextInput } from "./components/text-input";
import { NumberTextInput } from "./components/number-text-input";

export type PokemonChoices = (IPokemonPick | undefined)[];
export type TrainerChoices = (ITrainerPick | undefined)[];
export type GifIcon = 'gif' | 'icon';

const excludedHintGames: string[] = ['hypnoshunches', 'mareaniesmarquees', 'pikachusmysterypokemon', 'smearglesmysterymoves',
'zygardesorders'];

const baseCommand = 'gamehostcontrolpanel';
const chooseHostInformation = 'choosehostinformation';
const chooseCustomDisplay = 'choosecustomdisplay';
const chooseRandomDisplay = 'chooserandomdisplay';
const chooseGenerateHints = 'choosegeneratehints';
const addPointsCommand = 'addpoints';
const removePointsCommand = 'removepoints';
const storedMessageInputCommand = 'storedmessage';
const twistInputCommand = 'twist';
const setCurrentPlayerCommand = 'setcurrentplayer';
const manualHostDisplayCommand = 'manualhostdisplay';
const randomHostDisplayCommand = 'randomhostdisplay';
const generateHintCommand = 'generatehint';
const sendDisplayCommand = 'senddisplay';
const autoSendCommand = 'autosend';
const autoSendYes = 'yes';
const autoSendNo = 'no';

const refreshCommand = 'refresh';
const autoRefreshCommand = 'autorefresh';
const closeCommand = 'close';

const maxGifs = 6;
const maxIcons = 15;
const maxTrainers = 6;

const pages: Dict<GameHostControlPanel> = {};

class GameHostControlPanel extends HtmlPageBase {
	static compatibleHintGames: string[] = [];
	static GameHostControlPanelLoaded: boolean = false;

	pageId = 'game-host-control-panel';

	autoSendDisplay: boolean = false;
	currentView: 'hostinformation' | 'manualhostdisplay' | 'randomhostdisplay' | 'generatehints';
	currentBackgroundColor: HexCode | undefined = undefined;
	currentPokemon: PokemonChoices = [];
	currentTrainers: TrainerChoices = [];
	currentPlayer: string = '';
	generateHintsGameHtml: string = '';
	generatedAnswer: IRandomGameAnswer | undefined = undefined;
	gifOrIcon: GifIcon = 'gif';
	pokemonGeneration: ModelGeneration = 'xy';
	storedMessageInput: MultiTextInput;
	twistInput: TextInput;
	addPointsInput: NumberTextInput;
	removePointsInput: NumberTextInput;

	manualHostDisplay: ManualHostDisplay;
	randomHostDisplay: RandomHostDisplay;

	constructor(room: Room, user: User) {
		super(room, user, baseCommand);

		GameHostControlPanel.loadData();

		const hostDisplayProps: IHostDisplayProps = {
			maxGifs,
			maxIcons,
			maxTrainers,
			clearBackgroundColor: (dontRender) => this.clearBackgroundColor(dontRender),
			setBackgroundColor: (color, dontRender) => this.setBackgroundColor(color, dontRender),
			clearPokemon: (index, dontRender) => this.clearPokemon(index, dontRender),
			selectPokemon: (index, pokemon, dontRender) => this.selectPokemon(index, pokemon, dontRender),
			clearRandomizedPokemon: () => this.clearRandomizedPokemon(),
			randomizePokemon: (pokemon) => this.randomizePokemon(pokemon),
			clearTrainer: (index, dontRender) => this.clearTrainer(index, dontRender),
			selectTrainer: (index, trainer, dontRender) => this.selectTrainer(index, trainer, dontRender),
			randomizeTrainers: (trainers) => this.randomizeTrainers(trainers),
			setGifOrIcon: (gifOrIcon, currentPokemon, dontRender) => this.setGifOrIcon(gifOrIcon, currentPokemon, dontRender),
			reRender: () => this.send(),
		};

		this.currentView = room.userHostedGame && room.userHostedGame.isHost(user) ? 'hostinformation' : 'manualhostdisplay';
		const hostInformation = this.currentView === 'hostinformation';

		this.addPointsInput = new NumberTextInput(this.commandPrefix, addPointsCommand, {
			min: 1,
			label: "Add point(s)",
			submitText: "Add",
			onClear: () => this.onClearAddPoints(),
			onErrors: () => this.onAddPointsErrors(),
			onSubmit: (output) => this.onSubmitAddPoints(output),
			reRender: () => this.send(),
		});
		this.addPointsInput.active = hostInformation;

		this.removePointsInput = new NumberTextInput(this.commandPrefix, removePointsCommand, {
			min: 1,
			label: "Remove point(s)",
			submitText: "Remove",
			onClear: () => this.onClearRemovePoints(),
			onErrors: () => this.onRemovePointsErrors(),
			onSubmit: (output) => this.onSubmitRemovePoints(output),
			reRender: () => this.send(),
		});
		this.removePointsInput.active = hostInformation;

		this.storedMessageInput = new MultiTextInput(this.commandPrefix, storedMessageInputCommand, {
			inputCount: 2,
			labels: ['Key', 'Message'],
			textAreas: [false, true],
			textAreaConfigurations: [null, {rows: 3, cols: 60}],
			onClear: () => this.onClearStoreMessage(),
			onErrors: () => this.onStoreMessageErrors(),
			onSubmit: (output) => this.onSubmitStoreMessage(output),
			reRender: () => this.send(),
		});
		this.storedMessageInput.active = hostInformation;

		this.twistInput = new TextInput(this.commandPrefix, twistInputCommand, {
			currentInput: room.userHostedGame && room.userHostedGame.twist ? room.userHostedGame.twist : "",
			label: "Enter twist",
			textArea: true,
			textAreaConfiguration: {rows: 3, cols: 60},
			onClear: () => this.onClearTwist(),
			onErrors: () => this.onTwistErrors(),
			onSubmit: (output) => this.onSubmitTwist(output),
			reRender: () => this.send(),
		});
		this.twistInput.active = hostInformation;

		this.manualHostDisplay = new ManualHostDisplay(this.commandPrefix, manualHostDisplayCommand, hostDisplayProps);
		this.manualHostDisplay.active = !hostInformation;

		this.randomHostDisplay = new RandomHostDisplay(this.commandPrefix, randomHostDisplayCommand,
			Object.assign({random: true}, hostDisplayProps));
		this.randomHostDisplay.active = false;

		this.components = [this.addPointsInput, this.removePointsInput, this.storedMessageInput, this.twistInput,
			this.manualHostDisplay, this.randomHostDisplay];

		pages[this.userId] = this;
	}

	static loadData(): void {
		if (this.GameHostControlPanelLoaded) return;

		for (const format of Games.getFormatList()) {
			if (format.canGetRandomAnswer && format.minigameCommand && !excludedHintGames.includes(format.id)) {
				this.compatibleHintGames.push(format.name);
			}
		}

		this.GameHostControlPanelLoaded = true;
	}

	onClose(): void {
		delete pages[this.userId];
	}

	chooseHostInformation(): void {
		if (this.currentView === 'hostinformation') return;

		this.addPointsInput.active = true;
		this.removePointsInput.active = true;
		this.storedMessageInput.active = true;
		this.twistInput.active = true;
		this.randomHostDisplay.active = false;
		this.manualHostDisplay.active = false;
		this.currentView = 'hostinformation';

		this.send();
	}

	chooseManualHostDisplay(): void {
		if (this.currentView === 'manualhostdisplay') return;

		this.addPointsInput.active = false;
		this.removePointsInput.active = false;
		this.storedMessageInput.active = false;
		this.twistInput.active = false;
		this.manualHostDisplay.active = true;
		this.randomHostDisplay.active = false;
		this.currentView = 'manualhostdisplay';

		this.send();
	}

	chooseRandomHostDisplay(): void {
		if (this.currentView === 'randomhostdisplay') return;

		this.addPointsInput.active = false;
		this.removePointsInput.active = false;
		this.storedMessageInput.active = false;
		this.twistInput.active = false;
		this.randomHostDisplay.active = true;
		this.manualHostDisplay.active = false;
		this.currentView = 'randomhostdisplay';

		this.send();
	}

	chooseGenerateHints(): void {
		if (this.currentView === 'generatehints') return;

		this.addPointsInput.active = false;
		this.removePointsInput.active = false;
		this.storedMessageInput.active = false;
		this.twistInput.active = false;
		this.randomHostDisplay.active = false;
		this.manualHostDisplay.active = false;
		this.currentView = 'generatehints';

		this.send();
	}

	onClearAddPoints(): void {
		this.send();
	}

	onAddPointsErrors(): void {
		this.send();
	}

	onSubmitAddPoints(output: string): void {
		if (!this.room.userHostedGame || !this.currentPlayer) return;

		const amount = parseInt(output.trim());
		if (isNaN(amount)) return;

		const user = Users.get(this.userName);
		if (user) {
			CommandParser.parse(this.room, user, Config.commandCharacter + "addpoint " + this.currentPlayer + ", " + amount, Date.now());
		}
	}

	onClearRemovePoints(): void {
		this.send();
	}

	onRemovePointsErrors(): void {
		this.send();
	}

	onSubmitRemovePoints(output: string): void {
		if (!this.room.userHostedGame || !this.currentPlayer) return;

		const amount = parseInt(output.trim());
		if (isNaN(amount)) return;

		const user = Users.get(this.userName);
		if (user) {
			CommandParser.parse(this.room, user, Config.commandCharacter + "removepoint " + this.currentPlayer + ", " + amount, Date.now());
		}
	}

	onClearStoreMessage(): void {
		this.send();
	}

	onStoreMessageErrors(): void {
		this.send();
	}

	onSubmitStoreMessage(output: string[]): void {
		if (!this.room.userHostedGame) return;

		const game = this.room.userHostedGame;
		const key = Tools.toId(output[0]);
		const message = output[1].trim();
		if (!game.storedMessages || !(key in game.storedMessages) || message !== game.storedMessages[key]) {
			const user = Users.get(this.userName);
			if (user) {
				CommandParser.parse(user, user, Config.commandCharacter + "store" + (key ? "m" : "") + " " + this.room.id + ", " +
					(key ? key + ", " : "") + message, Date.now());
			}
		}

		this.send();
	}

	onClearTwist(): void {
		this.send();
	}

	onTwistErrors(): void {
		this.send();
	}

	onSubmitTwist(output: string): void {
		if (!this.room.userHostedGame) return;

		const game = this.room.userHostedGame;
		const message = output.trim();
		if (!game.twist || message !== game.twist) {
			const user = Users.get(this.userName);
			if (user) {
				CommandParser.parse(user, user, Config.commandCharacter + "twist " + this.room.id + ", " + message, Date.now());
			}
		}

		this.send();
	}

	setCurrentPlayer(id: string): void {
		if (this.currentPlayer === id) return;

		this.currentPlayer = id;

		this.send();
	}

	clearBackgroundColor(dontRender: boolean | undefined): void {
		this.currentBackgroundColor = undefined;

		if (!dontRender) this.send();
	}

	setBackgroundColor(color: IColorPick, dontRender: boolean | undefined): void {
		this.currentBackgroundColor = color.hexCode;

		if (this.currentView === 'randomhostdisplay') {
			this.manualHostDisplay.setRandomizedBackgroundColor(color.hueVariation, color.lightness, color.hexCode);
		}

		if (!dontRender) {
			if (this.autoSendDisplay) this.sendHostDisplay();
			this.send();
		}
	}

	clearPokemon(index: number, dontRender: boolean | undefined): void {
		this.currentPokemon[index] = undefined;

		if (!dontRender) this.send();
	}

	selectPokemon(index: number, pokemon: IPokemonPick, dontRender: boolean | undefined): void {
		this.currentPokemon[index] = pokemon;

		if (!dontRender) {
			if (this.autoSendDisplay) this.sendHostDisplay();
			this.send();
		}
	}

	clearRandomizedPokemon(): void {
		this.currentPokemon = [];

		this.send();
	}

	randomizePokemon(pokemon: PokemonChoices): void {
		this.manualHostDisplay.setRandomizedPokemon(pokemon);
		this.currentPokemon = pokemon;

		if (this.autoSendDisplay) this.sendHostDisplay();
		this.send();
	}

	clearTrainer(index: number, dontRender: boolean | undefined): void {
		this.currentTrainers[index] = undefined;

		if (!dontRender) this.send();
	}

	selectTrainer(index: number, trainer: ITrainerPick, dontRender: boolean | undefined): void {
		this.currentTrainers[index] = trainer;

		if (!dontRender) {
			if (this.autoSendDisplay) this.sendHostDisplay();
			this.send();
		}
	}

	randomizeTrainers(trainers: TrainerChoices): void {
		this.manualHostDisplay.setRandomizedTrainers(trainers);
		this.currentTrainers = trainers;

		if (this.autoSendDisplay) this.sendHostDisplay();
		this.send();
	}

	setGifOrIcon(gifOrIcon: GifIcon, currentPokemon: PokemonChoices, dontRender: boolean | undefined): void {
		this.gifOrIcon = gifOrIcon;

		if (this.currentView === 'manualhostdisplay') {
			this.randomHostDisplay.setGifOrIcon(gifOrIcon, true);
		} else {
			this.manualHostDisplay.setGifOrIcon(gifOrIcon, true);
		}

		this.currentPokemon = currentPokemon;

		if (!dontRender) this.send();
	}

	setAutoSend(autoSend: boolean): void {
		if (this.autoSendDisplay === autoSend) return;

		this.autoSendDisplay = autoSend;

		this.send();
	}

	generateHint(user: User, name: string): boolean {
		if (!GameHostControlPanel.compatibleHintGames.includes(name)) return false;

		const format = Games.getFormat(name);
		if (Array.isArray(format) || !format.canGetRandomAnswer) return false;

		if (user.game) user.game.deallocate(true);

		const game = Games.createGame(user, format, this.room, true);
		this.generateHintsGameHtml = game.getMascotAndNameHtml(undefined, true);
		this.generatedAnswer = game.getRandomAnswer!();
		game.deallocate(true);

		this.send();

		return true;
	}

	getTrainers(): ITrainerPick[] {
		return this.currentTrainers.filter(x => x !== undefined) as ITrainerPick[];
	}

	getPokemon(): IPokemonPick[] {
		return this.currentPokemon.filter(x => x !== undefined) as IPokemonPick[];
	}

	getHostDisplay(): string {
		return Games.getHostCustomDisplay(this.userName, this.currentBackgroundColor, this.getTrainers(), this.getPokemon(),
			this.gifOrIcon === 'icon');
	}

	sendHostDisplay(): void {
		const user = Users.get(this.userName);
		if (!user || !this.room.userHostedGame || !this.room.userHostedGame.isHost(user)) return;

		this.room.userHostedGame.sayHostDisplayUhtml(user, this.currentBackgroundColor, this.getTrainers(), this.getPokemon(),
			this.gifOrIcon === 'icon');
		this.send();
	}

	render(): string {
		let html = "<div class='chat' style='margin-top: 4px;margin-left: 4px'><center><b>" + this.room.title + ": Hosting Control " +
			"Panel</b>";
		html += "&nbsp;" + Client.getPmSelfButton(this.commandPrefix + ", " + closeCommand, "Close");
		html += "<br /><br />";

		const user = Users.get(this.userId);
		const currentHost = user && this.room.userHostedGame && this.room.userHostedGame.isHost(user);

		const hostInformation = this.currentView === 'hostinformation';
		const manualHostDisplay = this.currentView === 'manualhostdisplay';
		const randomHostDisplay = this.currentView === 'randomhostdisplay';
		const generateHints = this.currentView === 'generatehints';

		html += "Options:";
		if (currentHost) {
			html += "&nbsp;" + Client.getPmSelfButton(this.commandPrefix + ", " + chooseHostInformation, "Host Information",
				hostInformation);
		}
		html += "&nbsp;" + Client.getPmSelfButton(this.commandPrefix + ", " + chooseCustomDisplay, "Manual Display", manualHostDisplay);
		html += "&nbsp;" + Client.getPmSelfButton(this.commandPrefix + ", " + chooseRandomDisplay, "Random Display", randomHostDisplay);
		html += "&nbsp;" + Client.getPmSelfButton(this.commandPrefix + ", " + chooseGenerateHints, "Generate Hints", generateHints);
		html += "</center>";

		if (hostInformation) {
			html += "<h3>Host Information</h3>";

			const game = this.room.userHostedGame!;

			html += game.getMascotAndNameHtml();
			html += "<br />";
			html += "<b>Remaining time</b>: " + Tools.toDurationString(game.endTime - Date.now());
			html += "&nbsp;" + Client.getPmSelfButton(this.commandPrefix + ", " + refreshCommand, "Refresh");
			if (game.gameTimerEndTime) {
				html += "<br /><br /><b>Game timer:</b> " + Tools.toDurationString(game.gameTimerEndTime - Date.now()) + " remaining";
				html += "&nbsp;" + Client.getPmSelfButton(this.commandPrefix + ", " + refreshCommand, "Refresh");
			}
			html += "<hr />";

			const remainingPlayerCount = game.getRemainingPlayerCount();
			html += "<b>Players</b> (" + remainingPlayerCount + ")" + (remainingPlayerCount ? ":" : "");
			if (game.teams) {
				html += "<br />";
				for (const i in game.teams) {
					const team = game.teams[i];
					html += "Team " + team.name + (team.points ? " (" + team.points + ")" : "") + " - " +
						game.getPlayerNames(game.getRemainingPlayers(team.players));
					html += "<br />";
				}
			} else {
				html += " " + game.getPlayerPoints();
				html += "<br />";
			}

			if (game.savedWinners.length) html += "<br /><b>Saved winners</b>: " + Tools.joinList(game.savedWinners.map(x => x.name));

			const remainingPlayers = Object.keys(game.getRemainingPlayers());
			if (game.scoreCap || remainingPlayers.length) html += "<br /><b>Points management</b>:";
			if (game.scoreCap) html += "<br />(the score cap is <b>" + game.scoreCap + "</b>)";

			if (remainingPlayers.length) {
				html += "<br /><center>";
				html += Client.getPmSelfButton(this.commandPrefix + ", " + setCurrentPlayerCommand, "Hide points controls",
					!this.currentPlayer);

				if (game.teams) {
					html += "<br /><br />";
					for (const i in game.teams) {
						const remainingTeamPlayers = Object.keys(game.getRemainingPlayers(game.teams[i].players));
						if (remainingTeamPlayers.length) {
							html += "Team " + game.teams[i].name + ":";
							for (const id of remainingTeamPlayers) {
								const player = game.players[id];
								html += "&nbsp;" + Client.getPmSelfButton(this.commandPrefix + ", " + setCurrentPlayerCommand + ", " + id,
									player.name, this.currentPlayer === id);
							}
							html += "<br />";
						}
					}

					if (this.currentPlayer) html += "<br />";
				} else {
					for (const id of remainingPlayers) {
						const player = game.players[id];
						html += "&nbsp;" + Client.getPmSelfButton(this.commandPrefix + ", " + setCurrentPlayerCommand + ", " + id,
							player.name, this.currentPlayer === id);
					}

					if (this.currentPlayer) html += "<br /><br />";
				}

				if (this.currentPlayer) {
					html += this.addPointsInput.render();
					html += this.removePointsInput.render();
				}

				html += "</center>";
			}

			html += "<br />";

			html += "<b>Stored messages</b> (<code>[key] | [message]</code>):<br />";
			const storedMessageKeys = game.storedMessages ? Object.keys(game.storedMessages) : [];
			if (storedMessageKeys.length) {
				for (const key of storedMessageKeys) {
					html += "<br />" + (key || "(none)") + " | <code>" + game.storedMessages![key] + "</code>";
					html += "&nbsp;" + Client.getPmSelfButton(Config.commandCharacter + "unstore, " + this.room.id +
						(key ? ", " + key : ""), "Clear");
					html += "&nbsp;" + Client.getMsgRoomButton(this.room,
						Config.commandCharacter + "stored" + (key ? " " + key : ""), "Send to " + this.room.title);
				}
				html += "<br />";
			}

			html += "<br />Store new message:<br /><br />" + this.storedMessageInput.render();

			html += "<br /><br />";

			html += "<b>Twist</b>: ";
			if (game.twist) {
				html += "<br />" + game.twist;
				html += "&nbsp;" + Client.getPmSelfButton(Config.commandCharacter + "removetwist, " + this.room.id, "Clear");
				html += "&nbsp;" + Client.getMsgRoomButton(this.room, Config.commandCharacter + "twist", "Send to " + this.room.title);
			}
			html += "<br /><br />";
			html += this.twistInput.render();
		} else if (manualHostDisplay || randomHostDisplay) {
			html += "<h3>" + (manualHostDisplay ? "Manual" : "Random") + " Display</h3>";

			const hostDisplay = this.getHostDisplay();
			html += hostDisplay;

			let disabledSend = !currentHost;
			if (!disabledSend && this.room.userHostedGame && this.room.userHostedGame.lastHostDisplayUhtml &&
				this.room.userHostedGame.lastHostDisplayUhtml.html === hostDisplay) {
				disabledSend = true;
			}
			html += "<center>" + Client.getPmSelfButton(this.commandPrefix + ", " + sendDisplayCommand, "Send to " + this.room.title,
				disabledSend) + "</center>";

			html += "<br />";
			html += "Auto-send after any change: ";
			html += Client.getPmSelfButton(this.commandPrefix + ", " + autoSendCommand + ", " + autoSendYes, "Yes",
				!currentHost || this.autoSendDisplay);
			html += "&nbsp;" + Client.getPmSelfButton(this.commandPrefix + ", " + autoSendCommand + ", " + autoSendNo, "No",
				!currentHost || !this.autoSendDisplay);

			html += "<br /><br />";
			if (manualHostDisplay) {
				html += this.manualHostDisplay.render();
			} else {
				html += this.randomHostDisplay.render();
			}
		} else {
			html += "<h3>Generate Hints</h3>";

			if (this.generatedAnswer) {
				html += "<div class='infobox'>" + this.generateHintsGameHtml;
				html += "<br /><br />";
				html += this.generatedAnswer.hint;
				html += "<br /><br />";
				html += "<b>Answer" + (this.generatedAnswer.answers.length > 1 ? "s" : "") + "</b>: " +
					this.generatedAnswer.answers.join(", ") + "</div>";
			} else {
				html += "<center><b>Click on a game's name to generate a hint and see the answer</b>!</center>";
			}
			html += "<br />";

			for (let i = 0; i < GameHostControlPanel.compatibleHintGames.length; i++) {
				const format = Games.getFormat(GameHostControlPanel.compatibleHintGames[i]);
				if (Array.isArray(format) || !format.canGetRandomAnswer) continue;

				if (i > 0) html += "&nbsp;";
				html += Client.getPmSelfButton(this.commandPrefix + ", " + generateHintCommand + ", " + format.name, format.name);
			}
		}

		html += "</div>";
		return html;
	}
}

export const commands: BaseCommandDefinitions = {
	[baseCommand]: {
		command(target, room, user) {
			if (!this.isPm(room)) return;
			const targets = target.split(",");
			const targetRoom = Rooms.search(targets[0]);
			if (!targetRoom) return this.sayError(['invalidBotRoom', targets[0]]);
			targets.shift();

			const cmd = Tools.toId(targets[0]);
			targets.shift();

			if (!cmd) {
				new GameHostControlPanel(targetRoom, user).open();
			} else if (cmd === chooseHostInformation) {
				if (!(user.id in pages)) new GameHostControlPanel(targetRoom, user);
				pages[user.id].chooseHostInformation();
			} else if (cmd === chooseCustomDisplay) {
				if (!(user.id in pages)) new GameHostControlPanel(targetRoom, user);
				pages[user.id].chooseManualHostDisplay();
			} else if (cmd === chooseRandomDisplay) {
				if (!(user.id in pages)) new GameHostControlPanel(targetRoom, user);
				pages[user.id].chooseRandomHostDisplay();
			} else if (cmd === chooseGenerateHints) {
				if (!(user.id in pages)) new GameHostControlPanel(targetRoom, user);
				pages[user.id].chooseGenerateHints();
			} else if (cmd === refreshCommand) {
				if (!(user.id in pages)) new GameHostControlPanel(targetRoom, user);
				pages[user.id].send();
			} else if (cmd === autoRefreshCommand) {
				if (user.id in pages) pages[user.id].send();
			} else if (cmd === generateHintCommand) {
				const name = targets[0].trim();
				if (!(user.id in pages)) new GameHostControlPanel(targetRoom, user);

				if (!pages[user.id].generateHint(user, name)) this.say("'" + name + "' is not a valid game for generating hints.");
			} else if (cmd === setCurrentPlayerCommand) {
				if (!(user.id in pages) || !targetRoom.userHostedGame || !targetRoom.userHostedGame.isHost(user)) return;

				pages[user.id].setCurrentPlayer(Tools.toId(targets[0]));
			} else if (cmd === autoSendCommand) {
				if (!(user.id in pages)) new GameHostControlPanel(targetRoom, user);

				const option = targets[0].trim();
				if (option !== autoSendYes && option !== autoSendNo) {
					return this.say("'" + option + "' is not a valid auto-send option.");
				}

				pages[user.id].setAutoSend(option === autoSendYes);
			} else if (cmd === sendDisplayCommand) {
				if (!(user.id in pages)) return;
				pages[user.id].sendHostDisplay();
			} else if (cmd === closeCommand) {
				if (!(user.id in pages)) new GameHostControlPanel(targetRoom, user);
				pages[user.id].close();
				delete pages[user.id];
			} else {
				if (!(user.id in pages)) new GameHostControlPanel(targetRoom, user);
				const error = pages[user.id].checkComponentCommands(cmd, targets);
				if (error) this.say(error);
			}
		},
		aliases: ['ghcp'],
	},
};