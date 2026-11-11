/* eslint-disable */
import { getLocale, experimentalStaticLocale } from "../runtime.js"

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */
/** @typedef {{}} GreetingInputs */
/** @typedef {{ name: NonNullable<unknown> }} HelloInputs */
/** @typedef {{ count: NonNullable<unknown> }} ItemsInputs */
/** @typedef {{ val: NonNullable<unknown> }} PriceInputs */
/** @typedef {{ val: NonNullable<unknown> }} WhenInputs */
import * as __en from "./en.js"
/**
* | output |
* | --- |
* | "Hello there, friend" |
*
* @param {GreetingInputs} inputs
* @param {{ locale?: "en" }} options
* @returns {LocalizedString}
*/
export const greeting = /** @type {((inputs?: GreetingInputs, options?: { locale?: "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<GreetingInputs, { locale?: "en" }, {}>} */ ((inputs = {}, options = {}) => {
	experimentalStaticLocale ?? options.locale ?? getLocale()
	return __en.greeting(inputs)
});
/**
* | output |
* | --- |
* | "Hello {name}, welcome back" |
*
* @param {HelloInputs} inputs
* @param {{ locale?: "en" }} options
* @returns {LocalizedString}
*/
export const hello = /** @type {((inputs: HelloInputs, options?: { locale?: "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<HelloInputs, { locale?: "en" }, {}>} */ ((inputs, options = {}) => {
	experimentalStaticLocale ?? options.locale ?? getLocale()
	return __en.hello(inputs)
});
/**
* | countPlural | output |
* | --- | --- |
* | "one" | "{count} item in your cart" |
* | "other" | "{count} items in your cart" |
*
* @param {ItemsInputs} inputs
* @param {{ locale?: "en" }} options
* @returns {LocalizedString}
*/
export const items = /** @type {((inputs: ItemsInputs, options?: { locale?: "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<ItemsInputs, { locale?: "en" }, {}>} */ ((inputs, options = {}) => {
	experimentalStaticLocale ?? options.locale ?? getLocale()
	return __en.items(inputs)
});
/**
* | output |
* | --- |
* | "Total: {valFmt}" |
*
* @param {PriceInputs} inputs
* @param {{ locale?: "en" }} options
* @returns {LocalizedString}
*/
export const price = /** @type {((inputs: PriceInputs, options?: { locale?: "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<PriceInputs, { locale?: "en" }, {}>} */ ((inputs, options = {}) => {
	experimentalStaticLocale ?? options.locale ?? getLocale()
	return __en.price(inputs)
});
/**
* | output |
* | --- |
* | "Updated {valFmt}" |
*
* @param {WhenInputs} inputs
* @param {{ locale?: "en" }} options
* @returns {LocalizedString}
*/
export const when = /** @type {((inputs: WhenInputs, options?: { locale?: "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<WhenInputs, { locale?: "en" }, {}>} */ ((inputs, options = {}) => {
	experimentalStaticLocale ?? options.locale ?? getLocale()
	return __en.when(inputs)
});