import type { Player } from "./room-activity";
import type { ScriptedGame } from "./room-game-scripted";
import type { UserHostedGame } from "./room-game-user-hosted";
import type { Tournament } from "./room-tournament";
import type { GroupName, IChatLogEntry, IOutgoingMessage, IRoomInfoResponse, MessageListener } from "./types/client";
import type { IFormat } from "./types/pokemon-showdown";
import type { IRepeatedMessage, IRoomMessageOptions, RoomType } from "./types/rooms";
import type { IUserHostedTournament } from "./types/tournaments";
import type { User } from "./users";

export class Room {
	approvedUserHostedTournaments: Dict<IUserHostedTournament> | null = null;
	chatLog: IChatLogEntry[] = [];
	configBannedWords: string[] | null = null;
	configBannedWordsRegex: RegExp | null = null;
	game: ScriptedGame | undefined = undefined;
	readonly htmlMessageListeners: Dict<MessageListener> = {};
	inviteOnlyBattle: boolean | null = null;
	readonly messageListeners: Dict<MessageListener> = {};
	modchat: string = 'off';
	newUserHostedTournaments: Dict<IUserHostedTournament> | null = null;
	repeatedMessages: Dict<IRepeatedMessage> | undefined = undefined;
	serverBannedWords: string[] | null = null;
	serverBannedWordsRegex: RegExp | null = null;
	serverHangman: boolean | undefined = undefined;
	timers: Dict<NodeJS.Timer> | null = null;
	tournament: Tournament | undefined = undefined;
	readonly uhtmlMessageListeners: Dict<Dict<MessageListener>> = {};
	userHostedGame: UserHostedGame | undefined = undefined;
	readonly users = new Set<User>();

	readonly id!: string;
	readonly publicId!: string;
	readonly sendId!: string;
	readonly title!: string;
	type!: RoomType;

	// set immediately in checkConfigSettings()
	unlinkTournamentReplays!: boolean;
	unlinkChallongeLinks!: boolean;

	constructor(id: string) {
		this.setId(id);
		this.setTitle(id);

		this.updateConfigSettings();
	}

	setId(id: string): void {
		// @ts-expect-error
		this.id = id;
		// @ts-expect-error
		this.sendId = id === 'lobby' ? '' : id;

		let publicId = id;
		const extractedBattleId = Client.extractBattleId(id);
		if (extractedBattleId) {
			publicId = extractedBattleId.publicId;
		}

		// @ts-expect-error
		this.publicId = publicId;
	}

	setTitle(title: string): void {
		// @ts-expect-error
		this.title = title;
	}

	init(type: RoomType): void {
		this.type = type;
	}

	deInit(): void {
		if (this.game && this.game.room === this) this.game.deallocate(true);
		if (this.tournament && this.tournament.room === this) this.tournament.deallocate();
		if (this.userHostedGame && this.userHostedGame.room === this) this.userHostedGame.deallocate(true);

		for (const i in this.repeatedMessages) {
			clearInterval(this.repeatedMessages[i].timer);
		}

		for (const i in this.timers) {
			clearTimeout(this.timers[i]);
		}

		this.users.forEach(user => {
			user.rooms.delete(this);
			if (!user.rooms.size) Users.remove(user);
		});
	}

	updateConfigSettings(): void {
		if (Config.roomBannedWords && this.id in Config.roomBannedWords) {
			this.configBannedWords = Config.roomBannedWords[this.id];
			this.configBannedWordsRegex = null;
		}

		this.unlinkTournamentReplays = Config.disallowTournamentBattleLinks && Config.disallowTournamentBattleLinks.includes(this.id) ?
			true : false;
		this.unlinkChallongeLinks = Config.allowUserHostedTournaments && Config.allowUserHostedTournaments.includes(this.id) ? true : false;
	}

	addChatLog(log: string): void {
		this.chatLog.unshift({log, type: 'chat'});
		this.trimChatLog();
	}

	addHtmlChatLog(log: string): void {
		this.chatLog.unshift({log, type: 'html'});
		this.trimChatLog();
	}

	addUhtmlChatLog(uhtmlName: string, log: string): void {
		this.chatLog.unshift({log, type: 'uhtml', uhtmlName});
		this.trimChatLog();
	}

	trimChatLog(): void {
		while (this.chatLog.length > 30) {
			this.chatLog.pop();
		}
	}

	onRoomInfoResponse(response: IRoomInfoResponse): void {
		this.modchat = response.modchat === false ? 'off' : response.modchat;
		this.setTitle(response.title);
	}

	onUserJoin(user: User, rank: string, onRename?: boolean): void {
		this.users.add(user);

		const roomData = user.rooms.get(this);
		user.rooms.set(this, {lastChatMessage: roomData ? roomData.lastChatMessage : 0, rank});

		if (this.game && this.game.onUserJoinRoom) this.game.onUserJoinRoom(this, user, onRename);
		if (this.tournament && this.tournament.onUserJoinRoom) this.tournament.onUserJoinRoom(this, user, onRename);
		if (this.userHostedGame && this.userHostedGame.onUserJoinRoom) this.userHostedGame.onUserJoinRoom(this, user, onRename);
	}

	onUserLeave(user: User): void {
		this.users.delete(user);
		user.rooms.delete(this);

		if (this.game && this.game.onUserLeaveRoom) this.game.onUserLeaveRoom(this, user);
		if (this.tournament && this.tournament.onUserLeaveRoom) this.tournament.onUserLeaveRoom(this, user);
		if (this.userHostedGame && this.userHostedGame.onUserLeaveRoom) this.userHostedGame.onUserLeaveRoom(this, user);

		if (!user.rooms.size) Users.remove(user);
	}

	say(message: string, options?: IRoomMessageOptions): void {
		if (global.Rooms.get(this.id) !== this) return;

		if (!(options && options.dontPrepare)) message = Tools.prepareMessage(message);
		if (!(options && options.dontCheckFilter)) {
			const filter = Client.checkFilters(message, this);
			if (filter) {
				Tools.logMessage("Message not sent in " + this.title + " due to " + filter + ": " + message);
				return;
			}
		}

		const outgoingMessage: IOutgoingMessage = Object.assign(options || {}, {
			roomid: this.id,
			message: this.sendId + "|" + message,
			type: options && options.type ? options.type : 'chat',
		});

		if (!options || !options.dontMeasure) {
			outgoingMessage.measure = true;

			if (!outgoingMessage.html) outgoingMessage.text = message;
		}

		Client.send(outgoingMessage);
	}

	sayCode(code: string): void {
		this.say("!code " + code, {dontCheckFilter: true, dontPrepare: true, type: 'code', html: Client.getCodeListenerHtml(code)});
	}

	sayHtml(html: string): void {
		this.say("/addhtmlbox " + html, {html: Client.getListenerHtml(html), dontCheckFilter: true, dontPrepare: true, type: 'chat-html'});
	}

	sayUhtml(uhtmlName: string, html: string): void {
		this.say("/adduhtml " + uhtmlName + ", " + html,
			{uhtmlName, html: Client.getListenerUhtml(html), dontCheckFilter: true, dontPrepare: true, type: 'chat-uhtml'});
	}

	sayUhtmlChange(uhtmlName: string, html: string): void {
		this.say("/changeuhtml " + uhtmlName + ", " + html,
			{uhtmlName, html: Client.getListenerUhtml(html), dontCheckFilter: true, dontPrepare: true, type: 'chat-uhtml'});
	}

	sayAuthUhtml(uhtmlName: string, html: string): void {
		this.say("/addrankuhtml +, " + uhtmlName + ", " + html,
			{dontCheckFilter: true, dontPrepare: true, dontMeasure: true, type: 'command'});
	}

	sayAuthUhtmlChange(uhtmlName: string, html: string): void {
		this.say("/changerankuhtml +, " + uhtmlName + ", " + html,
			{dontCheckFilter: true, dontPrepare: true, dontMeasure: true, type: 'command'});
	}

	sayModUhtml(uhtmlName: string, html: string, rank: GroupName): void {
		this.say("/addrankuhtml " + Client.getGroupSymbols()[rank] + ", " + uhtmlName + ", " + html,
			{dontCheckFilter: true, dontPrepare: true, dontMeasure: true, type: 'command'});
	}

	sayModUhtmlChange(uhtmlName: string, html: string, rank: GroupName): void {
		this.say("/changerankuhtml " + Client.getGroupSymbols()[rank] + ", " + uhtmlName + ", " + html,
			{dontCheckFilter: true, dontPrepare: true, dontMeasure: true, type: 'command'});
	}

	pmHtml(user: User | Player, html: string): void {
		if (!Users.get(user.name)) return;

		this.say("/pminfobox " + user.id + "," + html, {html: Client.getListenerHtml(html, true), dontCheckFilter: true, dontPrepare: true,
			type: 'pm-html', user: user.id});
	}

	pmUhtml(user: User | Player, uhtmlName: string, html: string): void {
		if (!Users.get(user.name)) return;

		this.say("/pmuhtml " + user.id + "," + uhtmlName + "," + html,
			{uhtmlName, html, dontCheckFilter: true, dontPrepare: true, type: 'pm-uhtml', user: user.id});
	}

	pmUhtmlChange(user: User | Player, uhtmlName: string, html: string): void {
		if (!Users.get(user.name)) return;

		this.say("/pmuhtmlchange " + user.id + "," + uhtmlName + "," + html,
			{uhtmlName, html, dontCheckFilter: true, dontPrepare: true, type: 'pm-uhtml', user: user.id});
	}

	announce(text: string): void {
		this.say("/announce " + text, {type: 'announce', announcement: text});
	}

	warn(user: User, reason: string): void {
		this.say("/warn " + user.name + ", " + reason, {type: 'warn', warnReason: reason});
	}

	modnote(text: string): void {
		this.say("/modnote " + text, {type: 'modnote', modnote: text});
	}

	notifyRank(rank: GroupName | 'all', title: string, message: string, highlightPhrase?: string): void {
		const symbol = rank === 'all' ? rank : Client.getGroupSymbols()[rank];
		this.say("/notifyrank " + symbol + "," + title + "," + message + (highlightPhrase ? ","  + highlightPhrase : ""),
			{dontCheckFilter: true, dontPrepare: true, type: 'notifyrank', notifyId: this.id + "-rank-" + rank,
			notifyTitle: title, notifyMessage: message});
	}

	notifyOffRank(rank: GroupName | 'all'): void {
		const symbol = rank === 'all' ? rank : Client.getGroupSymbols()[rank];
		this.say("/notifyoffrank " + symbol,
			{dontCheckFilter: true, dontPrepare: true, type: 'notifyoffrank', notifyId: this.id + "-rank-" + rank});
	}

	sendHtmlPage(user: User | Player, pageId: string, html: string): void {
		if (!Users.get(user.name)) return;

		this.say("/sendhtmlpage " + user.id + "," + pageId + "," + html,
			{dontCheckFilter: true, dontPrepare: true, type: 'htmlpage', user: user.id, pageId: Users.self.id + "-" + pageId});
	}

	closeHtmlPage(user: User | Player, pageId: string): void {
		this.sendHtmlPage(user, pageId, "|deinit|");
	}

	sendHighlightPage(user: User | Player, pageId: string, notificationTitle?: string, highlightPhrase?: string): void {
		if (!Users.get(user.name)) return;

		this.say("/highlighthtmlpage " + user.id + "," + pageId + "," + notificationTitle + (highlightPhrase ? "," + highlightPhrase : ""),
			{dontCheckFilter: true, dontPrepare: true, type: 'highlight-htmlpage', user: user.id, pageId: Users.self.id + "-" + pageId});
	}

	setModchat(level: string): void {
		this.say("/modchat " + level, {dontCheckFilter: true, dontPrepare: true, type: 'modchat', modchatLevel: level});
	}

	roomVoice(name: string): void {
		this.say("/roomvoice " + name, {dontCheckFilter: true, dontPrepare: true, type: 'room-voice', user: Tools.toId(name)});
	}

	roomDeAuth(name: string): void {
		this.say("/roomdeauth " + name, {dontCheckFilter: true, dontPrepare: true, type: 'room-deauth', user: Tools.toId(name)});
	}

	createTournament(format: IFormat, cap?: number, tournamentName?: string): void {
		if (!cap) cap = 0;

		this.say("/tour new " + format.id + ", elimination," + cap + (tournamentName ? ",1," + tournamentName : ""),
			{dontCheckFilter: true, dontPrepare: true, type: 'tournament-create'});
	}

	startTournament(): void {
		this.say("/tour start", {dontCheckFilter: true, dontPrepare: true, type: 'tournament-start'});
	}

	nameTournament(name: string): void {
		this.say("/tour name " + name, {dontCheckFilter: true, dontPrepare: true, type: 'tournament-name'});
	}

	setTournamentCap(playerCap: number): void {
		this.say("/tour cap " + playerCap, {dontCheckFilter: true, dontPrepare: true, type: 'tournament-cap'});
	}

	autoStartTournament(): void {
		this.say("/tour autostart on", {dontCheckFilter: true, dontPrepare: true, type: 'tournament-autostart'});
	}

	setTournamentAutoDq(minutes: number): void {
		this.say("/tour autodq " + minutes, {dontCheckFilter: true, dontPrepare: true, type: 'tournament-autodq'});
	}

	forcePublicTournament(): void {
		this.say("/tour forcepublic on", {dontCheckFilter: true, dontPrepare: true, type: 'tournament-forcepulic'});
	}

	disallowTournamentScouting(): void {
		this.say("/tour scouting disallow", {dontCheckFilter: true, dontPrepare: true, type: 'tournament-scouting'});
	}

	disallowTournamentModjoin(): void {
		this.say("/tour modjoin disallow", {dontCheckFilter: true, dontPrepare: true, type: 'tournament-modjoin'});
	}

	setTournamentRules(rules: string): void {
		this.say("/tour rules " + rules, {dontCheckFilter: true, dontPrepare: true, type: 'tournament-rules'});
	}

	startHangman(answer: string, hint: string): void {
		this.say("/hangman create " + answer + ", " + hint, {dontCheckFilter: true, dontPrepare: true, type: 'hangman-start'});
	}

	endHangman(): void {
		this.say("/hangman end", {dontCheckFilter: true, dontPrepare: true, type: 'hangman-end'});
	}

	leave(): void {
		this.say("/leave", {dontCheckFilter: true, dontPrepare: true, type: 'leave-room'});
	}

	on(message: string, listener: MessageListener): void {
		this.messageListeners[Tools.toId(Tools.prepareMessage(message))] = listener;
	}

	onHtml(html: string, listener: MessageListener, serverHtml?: boolean): void {
		this.htmlMessageListeners[Tools.toId(serverHtml ? html : Client.getListenerHtml(html))] = listener;
	}

	onUhtml(name: string, html: string, listener: MessageListener): void {
		const id = Tools.toId(name);
		if (!(id in this.uhtmlMessageListeners)) this.uhtmlMessageListeners[id] = {};
		this.uhtmlMessageListeners[id][Tools.toId(Client.getListenerUhtml(html))] = listener;
	}

	off(message: string): void {
		delete this.messageListeners[Tools.toId(Tools.prepareMessage(message))];
	}

	offHtml(html: string, serverHtml?: boolean): void {
		delete this.htmlMessageListeners[Tools.toId(serverHtml ? html : Client.getListenerHtml(html))];
	}

	offUhtml(name: string, html: string): void {
		const id = Tools.toId(name);
		if (!(id in this.uhtmlMessageListeners)) return;
		delete this.uhtmlMessageListeners[id][Tools.toId(Client.getListenerUhtml(html))];
	}
}

export class Rooms {
	private rooms: Dict<Room> = {};

	add(id: string): Room {
		if (!(id in this.rooms)) this.rooms[id] = new Room(id);
		return this.rooms[id];
	}

	remove(room: Room): void {
		room.deInit();

		const id = room.id;
		for (const i in room) {
			// @ts-expect-error
			delete room[i];
		}

		delete this.rooms[id];
	}

	removeAll(): void {
		for (const i in this.rooms) {
			this.remove(this.rooms[i]);
		}
	}

	get(id: string): Room | undefined {
		return this.rooms[id];
	}

	getRoomIds(): string[] {
		return Object.keys(this.rooms);
	}

	renameRoom(room: Room, newId: string, newTitle: string): void {
		delete this.rooms[room.id];
		this.rooms[newId] = room;
		room.setId(newId);
		room.setTitle(newTitle);
	}

	search(input: string): Room | undefined {
		let id = Tools.toRoomId(input);
		if (Config.roomAliases && !(id in this.rooms) && Config.roomAliases[id]) id = Config.roomAliases[id];
		return this.get(id);
	}

	updateConfigSettings(): void {
		for (const i in this.rooms) {
			this.rooms[i].updateConfigSettings();
		}
	}
}

export const instantiate = (): void => {
	global.Rooms = new Rooms();
};