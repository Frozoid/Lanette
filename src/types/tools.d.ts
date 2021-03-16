export type HexCode = string & {__hexcode: true};

export type NamedHexCode = 'Red' | 'Dark-Red' | 'Light-Red' | 'Red-Orange' | 'Dark-Red-Orange' | 'Light-Red-Orange' | 'Orange' |
	'Dark-Orange' | 'Light-Orange' | 'Yellow-Orange' | 'Dark-Yellow-Orange' | 'Light-Yellow-Orange' | 'Yellow' | 'Dark-Yellow' |
	'Light-Yellow' | 'Yellow-Green' | 'Dark-Yellow-Green' | 'Light-Yellow-Green' | 'Green' | 'Dark-Green' | 'Light-Green' | 'Cyan' |
	'Dark-Cyan' | 'Light-Cyan' | 'Blue' | 'Dark-Blue' | 'Light-Blue' | 'Blue-Violet' | 'Dark-Blue-Violet' | 'Light-Blue-Violet' | 'Violet' |
	'Dark-Violet' | 'Light-Violet' | 'Pink' | 'Dark-Pink' | 'Light-Pink' | 'Red-Violet' | 'Dark-Red-Violet' | 'Light-Red-Violet' |
	'White' | 'Gray' | 'Dark-Gray' | 'Light-Gray' | 'Black' | 'Brown' | 'Dark-Brown' | 'Light-Brown';

export type TimeZone = 'GMT-12:00' | 'GMT-11:00' | 'GMT-10:00' | 'GMT-09:30' | 'GMT-09:00' | 'GMT-08:00' | 'GMT-07:00' | 'GMT-06:00' |
'GMT-05:00' | 'GMT-04:00' | 'GMT-03:30' | 'GMT-03:00' | 'GMT-02:00' | 'GMT-01:00' | 'GMT+00:00' | 'GMT+01:00' | 'GMT+02:00' | 'GMT+03:00' |
'GMT+03:30' | 'GMT+04:00' | 'GMT+04:30' | 'GMT+05:00' | 'GMT+05:30' | 'GMT+05:45' | 'GMT+06:00' | 'GMT+06:30' | 'GMT+07:00' | 'GMT+08:00' |
'GMT+08:45' | 'GMT+09:00' | 'GMT+09:30' | 'GMT+10:00' | 'GMT+10:30' | 'GMT+11:00' | 'GMT+12:00' | 'GMT+12:45' | 'GMT+13:00' | 'GMT+14:00';

export interface IHexCodeData {
	color: string;
	gradient: string;
	category?: 'light' | 'dark';
	textColor?: '#000000' | '#ffffff';
}

export interface IParsedSmogonLink {
	description: string;
	link: string;
	dexPage?: string;
	postId?: string;
	threadId?: string;
}

export interface IExtractedBattleId {
	format: string;
	fullId: string;
	publicId: string;
	password: string;
}