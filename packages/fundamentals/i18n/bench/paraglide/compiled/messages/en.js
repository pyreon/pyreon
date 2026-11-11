/* eslint-disable */
/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */
/** @typedef {{}} GreetingInputs */
/** @typedef {{ name: NonNullable<unknown> }} HelloInputs */
/** @typedef {{ count: NonNullable<unknown> }} ItemsInputs */
/** @typedef {{ val: NonNullable<unknown> }} PriceInputs */
/** @typedef {{ val: NonNullable<unknown> }} WhenInputs */
import * as __paraglideRegistry from "../registry.js"


export const greeting = /** @type {(inputs: GreetingInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Hello there, friend`)
};

export const hello = /** @type {(inputs: HelloInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`Hello ${i?.name}, welcome back`)
};

export const items = /** @type {(inputs: ItemsInputs) => LocalizedString} */ (i) => {
	const countPlural = __paraglideRegistry.plural("en", i?.count, {}, true);
	if (countPlural === "one") return /** @type {LocalizedString} */ (`${i?.count} item in your cart`);
	if (countPlural === "other") return /** @type {LocalizedString} */ (`${i?.count} items in your cart`);
	return /** @type {LocalizedString} */ ("items");
};

export const price = /** @type {(inputs: PriceInputs) => LocalizedString} */ (i) => {
	const valFmt = __paraglideRegistry.number("en", i?.val, {}, true);
	return /** @type {LocalizedString} */ (`Total: ${valFmt}`)
};

export const when = /** @type {(inputs: WhenInputs) => LocalizedString} */ (i) => {
	const valFmt = __paraglideRegistry.datetime("en", i?.val, { dateStyle: "medium" }, true);
	return /** @type {LocalizedString} */ (`Updated ${valFmt}`)
};