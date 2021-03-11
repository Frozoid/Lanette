import { assertStrictEqual } from "../test/test-tools";
import type { GameFileTests, IGameFile } from "../types/games";
import { game as questionAndAnswerGame, QuestionAndAnswer } from './templates/question-and-answer';

type Operation = 'add' | 'subtract' | 'multiply' | 'divide';

const BASE_OPERANDS = 2;
const operations: Operation[] = ['add', 'subtract', 'multiply', 'divide'];
const operationSymbols: KeyedDict<Operation, string> = {
	'add': '+',
	'subtract': '-',
	'multiply': '*',
	'divide': '/',
};

const data: {highestPokedexNumber: number, pokemonByNumber: Dict<string[]>} = {
	highestPokedexNumber: 0,
	pokemonByNumber: {},
};

class GrumpigsPokemath extends QuestionAndAnswer {
	lastOperation: Operation = 'divide';
	lastResult: number = 0;
	roundTime = 30 * 1000;

	roundOperands?: number;

	static loadData(): void {
		const pokedex = Games.getPokemonList();
		for (const pokemon of pokedex) {
			if (!(pokemon.num in data.pokemonByNumber)) data.pokemonByNumber[pokemon.num] = [];
			data.pokemonByNumber[pokemon.num].push(pokemon.name);

			if (pokemon.num > data.highestPokedexNumber) data.highestPokedexNumber = pokemon.num;
		}
	}

	getOperand(): number {
		return this.random(data.highestPokedexNumber) + 1;
	}

	generateOperands(operation: Operation, amount: number): number[] {
		const multiplyOrDivide = operation === 'multiply' || operation === 'divide';
		const operands: number[] = [];
		for (let i = 0; i < amount; i++) {
			let operand = this.getOperand();
			while (multiplyOrDivide && operand === 1) {
				operand = this.getOperand();
			}
			operands.push(operand);
		}

		if (multiplyOrDivide && amount === 2) {
			while (operands[0] === operands[1]) {
				operands[1] = this.getOperand();
			}
		}

		return operands;
	}

	getOperandsAndResult(operation: Operation, amount: number): {operands: number[], result: number} {
		let operands = this.generateOperands(operation, amount);
		let result = this.calculateResult(operation, operands);
		while (result === this.lastResult || !(result in data.pokemonByNumber)) {
			operands = this.generateOperands(operation, amount);
			result = this.calculateResult(operation, operands);
		}

		return {operands, result};
	}

	calculateResult(operation: Operation, operands: number[]): number {
		let result: number;
		if (operation === 'add') {
			result = 0;
			operands.forEach(x => result += x);
		} else if (operation === 'subtract') {
			result = operands[0];
			operands.slice(1).forEach(x => result -= x);
		} else if (operation === 'multiply') {
			result = 1;
			operands.forEach(x => result *= x);
		} else {
			result = operands[0];
			operands.slice(1).forEach(x => result /= x);
		}

		return result;
	}

	generateAnswer(): void {
		let operation = this.sampleOne(operations);
		while (operation === this.lastOperation) {
			operation = this.sampleOne(operations);
		}
		this.lastOperation = operation;

		let operandsCount: number;
		if (this.roundOperands) {
			operandsCount = this.roundOperands;
		} else if (this.format.inputOptions.operands) {
			operandsCount = this.format.options.operands;
		} else {
			operandsCount = BASE_OPERANDS;
			if ('operands' in this.format.customizableOptions && operation !== 'multiply' && operation !== 'divide') {
				operandsCount += this.random(this.format.customizableOptions.operands.max - BASE_OPERANDS + 1);
			}
		}

		const operandsAndResult = this.getOperandsAndResult(operation, operandsCount);
		this.lastResult = operandsAndResult.result;

		this.answers = data.pokemonByNumber[operandsAndResult.result];

		this.hint = "<b>" + operandsAndResult.operands.map(x => data.pokemonByNumber[x][0]).join(" " + operationSymbols[operation] + " ") +
			" = ?</b>";
	}

	increaseDifficulty(): void {
		this.roundTime = Math.max(6000, this.roundTime - 1.5 * 1000);
	}
}

const tests: GameFileTests<GrumpigsPokemath> = {
	'should calculate results correctly': {
		// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
		test(game): void {
			assertStrictEqual(game.calculateResult('add', [1, 2]), 3);
			assertStrictEqual(game.calculateResult('add', [3, 4, 5]), 12);
			assertStrictEqual(game.calculateResult('subtract', [3, 2]), 1);
			assertStrictEqual(game.calculateResult('subtract', [12, 5, 4]), 3);
			assertStrictEqual(game.calculateResult('multiply', [2, 3]), 6);
			assertStrictEqual(game.calculateResult('multiply', [4, 5, 6]), 120);
			assertStrictEqual(game.calculateResult('divide', [6, 3]), 2);
			assertStrictEqual(game.calculateResult('divide', [120, 6, 5]), 4);
		},
	},
};

export const game: IGameFile<GrumpigsPokemath> = Games.copyTemplateProperties(questionAndAnswerGame, {
	aliases: ['grumpigs', 'pokemath'],
	category: 'knowledge',
	class: GrumpigsPokemath,
	commandDescriptions: [Config.commandCharacter + "g [Pokemon]"],
	customizableOptions: {
		operands: {min: 2, base: BASE_OPERANDS, max: 4},
	},
	defaultOptions: ['points'],
	description: "Players guess Pokemon whose dex numbers match the answers to the given math problems!",
	freejoin: true,
	name: "Grumpig's Pokemath",
	mascot: "Grumpig",
	minigameCommand: 'pokemath',
	minigameDescription: "Use <code>" + Config.commandCharacter + "g</code> to guess the Pokemon whose dex number matches the answer to " +
		"the math problem!",
	modes: ["survival", "team"],
	modeProperties: {
		'survival': {
			roundTime: 23.5 * 1000,
			roundOperands: BASE_OPERANDS,
		},
	},
	tests: Object.assign({}, questionAndAnswerGame.tests, tests),
});
