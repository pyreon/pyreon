import * as _isFormatEmail_1 from "typia/lib/internal/_isFormatEmail";
import * as _isTypeInt32_1 from "typia/lib/internal/_isTypeInt32";
import * as _stringLength_1 from "typia/lib/internal/_stringLength";
import * as _throwTypeGuardError_1 from "typia/lib/internal/_throwTypeGuardError";
import * as _validateReport_1 from "typia/lib/internal/_validateReport";
/**
 * typia fixtures for the @pyreon/validate comparison benchmark.
 *
 * typia validates from a TYPE at COMPILE time, so its validators cannot be
 * built at runtime like every other library here. This file is the source of
 * truth for the shapes; it is compiled ahead of time with `ttsc` and the
 * emitted plain JS is what the benchmark imports.
 *
 * Two exports per scenario, matching the benchmark's two axes:
 *   is<Name>       — typia.createIs        → boolean verdict
 *   validate<Name> — plain.createValidateClone → { success, data } + errors,
 *                    allocating a STRIPPED clone. This is the honest analogue
 *                    of zod's safeParse; `typia.validate` returns the input by
 *                    reference and would be measuring less work.
 */
import typia, { plain } from 'typia';
// 1 — string.email
export const isStringEmail = (() => {
    return input => "string" === typeof input && _isFormatEmail_1._isFormatEmail(input);
})();
export const validateStringEmail = (() => {
    const __is = input => "string" === typeof input && _isFormatEmail_1._isFormatEmail(input);
    let errors;
    let _report;
    const __validate = input => {
        if (false === __is(input)) {
            errors = [];
            _report = _validateReport_1._validateReport(errors);
            ((input, _path, _exceptionable = true) => "string" === typeof input && (_isFormatEmail_1._isFormatEmail(input) || _report(true, {
                path: _path + "",
                expected: "string & Format<\"email\">",
                value: input
            })) || _report(true, {
                path: _path + "",
                expected: "(string & Format<\"email\">)",
                value: input
            }))(input, "$input", true);
            const success = 0 === errors.length;
            return success ? {
                success,
                data: input
            } : {
                success,
                errors,
                data: input
            };
        }
        return {
            success: true,
            data: input
        };
    };
    const __clone = input => input;
    return input => {
        const result = __validate(input);
        if (result.success)
            result.data = __clone(input);
        return result;
    };
})();
// 2 — number.int.range
export const isNumberRange = (() => {
    return input => "number" === typeof input && (_isTypeInt32_1._isTypeInt32(input) && 0 <= input && input <= 150);
})();
export const validateNumberRange = (() => {
    const __is = input => "number" === typeof input && (_isTypeInt32_1._isTypeInt32(input) && 0 <= input && input <= 150);
    let errors;
    let _report;
    const __validate = input => {
        if (false === __is(input)) {
            errors = [];
            _report = _validateReport_1._validateReport(errors);
            ((input, _path, _exceptionable = true) => "number" === typeof input && (_isTypeInt32_1._isTypeInt32(input) || _report(true, {
                path: _path + "",
                expected: "number & Type<\"int32\">",
                value: input
            })) && (0 <= input || _report(true, {
                path: _path + "",
                expected: "number & Minimum<0>",
                value: input
            })) && (input <= 150 || _report(true, {
                path: _path + "",
                expected: "number & Maximum<150>",
                value: input
            })) || _report(true, {
                path: _path + "",
                expected: "(number & Type<\"int32\"> & Minimum<0> & Maximum<150>)",
                value: input
            }))(input, "$input", true);
            const success = 0 === errors.length;
            return success ? {
                success,
                data: input
            } : {
                success,
                errors,
                data: input
            };
        }
        return {
            success: true,
            data: input
        };
    };
    const __clone = input => input;
    return input => {
        const result = __validate(input);
        if (result.success)
            result.data = __clone(input);
        return result;
    };
})();
export const isUser = (() => {
    const _io0 = input => "string" === typeof input.name && 2 <= _stringLength_1._stringLength(input.name) && ("number" === typeof input.age && (_isTypeInt32_1._isTypeInt32(input.age) && 0 <= input.age && input.age <= 150)) && ("string" === typeof input.email && _isFormatEmail_1._isFormatEmail(input.email)) && (Array.isArray(input.tags) && input.tags.every(elem => "string" === typeof elem));
    return input => "object" === typeof input && null !== input && _io0(input);
})();
export const validateUser = (() => {
    const _co0 = input => ({
        name: input.name,
        age: input.age,
        email: input.email,
        tags: (() => input.tags.map(elem => elem))()
    });
    const _io0 = input => "string" === typeof input.name && 2 <= _stringLength_1._stringLength(input.name) && ("number" === typeof input.age && (_isTypeInt32_1._isTypeInt32(input.age) && 0 <= input.age && input.age <= 150)) && ("string" === typeof input.email && _isFormatEmail_1._isFormatEmail(input.email)) && (Array.isArray(input.tags) && input.tags.every(elem => "string" === typeof elem));
    const _vo0 = (input, _path, _exceptionable = true) => ["string" === typeof input.name && (2 <= _stringLength_1._stringLength(input.name) || _report(_exceptionable, {
            path: _path + ".name",
            expected: "string & MinLength<2>",
            value: input.name
        })) || _report(_exceptionable, {
            path: _path + ".name",
            expected: "(string & MinLength<2>)",
            value: input.name
        }), "number" === typeof input.age && (_isTypeInt32_1._isTypeInt32(input.age) || _report(_exceptionable, {
            path: _path + ".age",
            expected: "number & Type<\"int32\">",
            value: input.age
        })) && (0 <= input.age || _report(_exceptionable, {
            path: _path + ".age",
            expected: "number & Minimum<0>",
            value: input.age
        })) && (input.age <= 150 || _report(_exceptionable, {
            path: _path + ".age",
            expected: "number & Maximum<150>",
            value: input.age
        })) || _report(_exceptionable, {
            path: _path + ".age",
            expected: "(number & Type<\"int32\"> & Minimum<0> & Maximum<150>)",
            value: input.age
        }), "string" === typeof input.email && (_isFormatEmail_1._isFormatEmail(input.email) || _report(_exceptionable, {
            path: _path + ".email",
            expected: "string & Format<\"email\">",
            value: input.email
        })) || _report(_exceptionable, {
            path: _path + ".email",
            expected: "(string & Format<\"email\">)",
            value: input.email
        }), (Array.isArray(input.tags) || _report(_exceptionable, {
            path: _path + ".tags",
            expected: "Array<string>",
            value: input.tags
        })) && input.tags.map((elem, _index2) => "string" === typeof elem || _report(_exceptionable, {
            path: _path + ".tags[" + _index2 + "]",
            expected: "string",
            value: elem
        })).every(flag => flag) || _report(_exceptionable, {
            path: _path + ".tags",
            expected: "Array<string>",
            value: input.tags
        })].every(flag => flag);
    const __is = input => "object" === typeof input && null !== input && _io0(input);
    let errors;
    let _report;
    const __validate = input => {
        if (false === __is(input)) {
            errors = [];
            _report = _validateReport_1._validateReport(errors);
            ((input, _path, _exceptionable = true) => ("object" === typeof input && null !== input || _report(true, {
                path: _path + "",
                expected: "User",
                value: input
            })) && _vo0(input, _path + "", true) || _report(true, {
                path: _path + "",
                expected: "User",
                value: input
            }))(input, "$input", true);
            const success = 0 === errors.length;
            return success ? {
                success,
                data: input
            } : {
                success,
                errors,
                data: input
            };
        }
        return {
            success: true,
            data: input
        };
    };
    const __clone = input => _co0(input);
    return input => {
        const result = __validate(input);
        if (result.success)
            result.data = __clone(input);
        return result;
    };
})();
export const isNameAgeArray = (() => {
    const _io0 = input => "string" === typeof input.name && 2 <= _stringLength_1._stringLength(input.name) && ("number" === typeof input.age && (_isTypeInt32_1._isTypeInt32(input.age) && 0 <= input.age && input.age <= 150));
    return input => Array.isArray(input) && input.every(elem => "object" === typeof elem && null !== elem && _io0(elem));
})();
export const validateNameAgeArray = (() => {
    const _co0 = input => ({
        name: input.name,
        age: input.age
    });
    const _io0 = input => "string" === typeof input.name && 2 <= _stringLength_1._stringLength(input.name) && ("number" === typeof input.age && (_isTypeInt32_1._isTypeInt32(input.age) && 0 <= input.age && input.age <= 150));
    const _vo0 = (input, _path, _exceptionable = true) => ["string" === typeof input.name && (2 <= _stringLength_1._stringLength(input.name) || _report(_exceptionable, {
            path: _path + ".name",
            expected: "string & MinLength<2>",
            value: input.name
        })) || _report(_exceptionable, {
            path: _path + ".name",
            expected: "(string & MinLength<2>)",
            value: input.name
        }), "number" === typeof input.age && (_isTypeInt32_1._isTypeInt32(input.age) || _report(_exceptionable, {
            path: _path + ".age",
            expected: "number & Type<\"int32\">",
            value: input.age
        })) && (0 <= input.age || _report(_exceptionable, {
            path: _path + ".age",
            expected: "number & Minimum<0>",
            value: input.age
        })) && (input.age <= 150 || _report(_exceptionable, {
            path: _path + ".age",
            expected: "number & Maximum<150>",
            value: input.age
        })) || _report(_exceptionable, {
            path: _path + ".age",
            expected: "(number & Type<\"int32\"> & Minimum<0> & Maximum<150>)",
            value: input.age
        })].every(flag => flag);
    const __is = input => Array.isArray(input) && input.every(elem => "object" === typeof elem && null !== elem && _io0(elem));
    let errors;
    let _report;
    const __validate = input => {
        if (false === __is(input)) {
            errors = [];
            _report = _validateReport_1._validateReport(errors);
            ((input, _path, _exceptionable = true) => (Array.isArray(input) || _report(true, {
                path: _path + "",
                expected: "Array<NameAge>",
                value: input
            })) && input.map((elem, _index2) => ("object" === typeof elem && null !== elem || _report(true, {
                path: _path + "[" + _index2 + "]",
                expected: "NameAge",
                value: elem
            })) && _vo0(elem, _path + "[" + _index2 + "]", true) || _report(true, {
                path: _path + "[" + _index2 + "]",
                expected: "NameAge",
                value: elem
            })).every(flag => flag) || _report(true, {
                path: _path + "",
                expected: "Array<NameAge>",
                value: input
            }))(input, "$input", true);
            const success = 0 === errors.length;
            return success ? {
                success,
                data: input
            } : {
                success,
                errors,
                data: input
            };
        }
        return {
            success: true,
            data: input
        };
    };
    const __clone = input => (() => input.map(elem => _co0(elem)))();
    return input => {
        const result = __validate(input);
        if (result.success)
            result.data = __clone(input);
        return result;
    };
})();
export const isDeep = (() => {
    const _io0 = input => "number" === typeof input.id && _isTypeInt32_1._isTypeInt32(input.id) && ("object" === typeof input.user && null !== input.user && _io1(input.user));
    const _io1 = input => "string" === typeof input.name && 2 <= _stringLength_1._stringLength(input.name) && ("object" === typeof input.address && null !== input.address && _io2(input.address));
    const _io2 = input => "string" === typeof input.city && 1 <= _stringLength_1._stringLength(input.city) && ("string" === typeof input.zip && (5 <= _stringLength_1._stringLength(input.zip) && _stringLength_1._stringLength(input.zip) <= 5));
    return input => "object" === typeof input && null !== input && _io0(input);
})();
export const validateDeep = (() => {
    const _co0 = input => ({
        id: input.id,
        user: _co1(input.user)
    });
    const _co1 = input => ({
        name: input.name,
        address: _co2(input.address)
    });
    const _co2 = input => ({
        city: input.city,
        zip: input.zip
    });
    const _io0 = input => "number" === typeof input.id && _isTypeInt32_1._isTypeInt32(input.id) && ("object" === typeof input.user && null !== input.user && _io1(input.user));
    const _io1 = input => "string" === typeof input.name && 2 <= _stringLength_1._stringLength(input.name) && ("object" === typeof input.address && null !== input.address && _io2(input.address));
    const _io2 = input => "string" === typeof input.city && 1 <= _stringLength_1._stringLength(input.city) && ("string" === typeof input.zip && (5 <= _stringLength_1._stringLength(input.zip) && _stringLength_1._stringLength(input.zip) <= 5));
    const _vo0 = (input, _path, _exceptionable = true) => ["number" === typeof input.id && (_isTypeInt32_1._isTypeInt32(input.id) || _report(_exceptionable, {
            path: _path + ".id",
            expected: "number & Type<\"int32\">",
            value: input.id
        })) || _report(_exceptionable, {
            path: _path + ".id",
            expected: "(number & Type<\"int32\">)",
            value: input.id
        }), ("object" === typeof input.user && null !== input.user || _report(_exceptionable, {
            path: _path + ".user",
            expected: "{ name: string & MinLength<2>; address: { city: string & MinLength<1>; zip: string & MinLength<5> & MaxLength<5>; }; }",
            value: input.user
        })) && _vo1(input.user, _path + ".user", true && _exceptionable) || _report(_exceptionable, {
            path: _path + ".user",
            expected: "{ name: string & MinLength<2>; address: { city: string & MinLength<1>; zip: string & MinLength<5> & MaxLength<5>; }; }",
            value: input.user
        })].every(flag => flag);
    const _vo1 = (input, _path, _exceptionable = true) => ["string" === typeof input.name && (2 <= _stringLength_1._stringLength(input.name) || _report(_exceptionable, {
            path: _path + ".name",
            expected: "string & MinLength<2>",
            value: input.name
        })) || _report(_exceptionable, {
            path: _path + ".name",
            expected: "(string & MinLength<2>)",
            value: input.name
        }), ("object" === typeof input.address && null !== input.address || _report(_exceptionable, {
            path: _path + ".address",
            expected: "{ city: string & MinLength<1>; zip: string & MinLength<5> & MaxLength<5>; }",
            value: input.address
        })) && _vo2(input.address, _path + ".address", true && _exceptionable) || _report(_exceptionable, {
            path: _path + ".address",
            expected: "{ city: string & MinLength<1>; zip: string & MinLength<5> & MaxLength<5>; }",
            value: input.address
        })].every(flag => flag);
    const _vo2 = (input, _path, _exceptionable = true) => ["string" === typeof input.city && (1 <= _stringLength_1._stringLength(input.city) || _report(_exceptionable, {
            path: _path + ".city",
            expected: "string & MinLength<1>",
            value: input.city
        })) || _report(_exceptionable, {
            path: _path + ".city",
            expected: "(string & MinLength<1>)",
            value: input.city
        }), "string" === typeof input.zip && (5 <= _stringLength_1._stringLength(input.zip) || _report(_exceptionable, {
            path: _path + ".zip",
            expected: "string & MinLength<5>",
            value: input.zip
        })) && (_stringLength_1._stringLength(input.zip) <= 5 || _report(_exceptionable, {
            path: _path + ".zip",
            expected: "string & MaxLength<5>",
            value: input.zip
        })) || _report(_exceptionable, {
            path: _path + ".zip",
            expected: "(string & MinLength<5> & MaxLength<5>)",
            value: input.zip
        })].every(flag => flag);
    const __is = input => "object" === typeof input && null !== input && _io0(input);
    let errors;
    let _report;
    const __validate = input => {
        if (false === __is(input)) {
            errors = [];
            _report = _validateReport_1._validateReport(errors);
            ((input, _path, _exceptionable = true) => ("object" === typeof input && null !== input || _report(true, {
                path: _path + "",
                expected: "Deep",
                value: input
            })) && _vo0(input, _path + "", true) || _report(true, {
                path: _path + "",
                expected: "Deep",
                value: input
            }))(input, "$input", true);
            const success = 0 === errors.length;
            return success ? {
                success,
                data: input
            } : {
                success,
                errors,
                data: input
            };
        }
        return {
            success: true,
            data: input
        };
    };
    const __clone = input => _co0(input);
    return input => {
        const result = __validate(input);
        if (result.success)
            result.data = __clone(input);
        return result;
    };
})();
export const isPage = (() => {
    const _io0 = input => "number" === typeof input.page && (_isTypeInt32_1._isTypeInt32(input.page) && 0 <= input.page) && (Array.isArray(input.items) && input.items.every(elem => "object" === typeof elem && null !== elem && _io1(elem)));
    const _io1 = input => "number" === typeof input.id && _isTypeInt32_1._isTypeInt32(input.id) && ("string" === typeof input.title && 1 <= _stringLength_1._stringLength(input.title)) && "boolean" === typeof input.done;
    return input => "object" === typeof input && null !== input && _io0(input);
})();
export const validatePage = (() => {
    const _co0 = input => ({
        page: input.page,
        items: (() => input.items.map(elem => _co1(elem)))()
    });
    const _co1 = input => ({
        id: input.id,
        title: input.title,
        done: input.done
    });
    const _io0 = input => "number" === typeof input.page && (_isTypeInt32_1._isTypeInt32(input.page) && 0 <= input.page) && (Array.isArray(input.items) && input.items.every(elem => "object" === typeof elem && null !== elem && _io1(elem)));
    const _io1 = input => "number" === typeof input.id && _isTypeInt32_1._isTypeInt32(input.id) && ("string" === typeof input.title && 1 <= _stringLength_1._stringLength(input.title)) && "boolean" === typeof input.done;
    const _vo0 = (input, _path, _exceptionable = true) => ["number" === typeof input.page && (_isTypeInt32_1._isTypeInt32(input.page) || _report(_exceptionable, {
            path: _path + ".page",
            expected: "number & Type<\"int32\">",
            value: input.page
        })) && (0 <= input.page || _report(_exceptionable, {
            path: _path + ".page",
            expected: "number & Minimum<0>",
            value: input.page
        })) || _report(_exceptionable, {
            path: _path + ".page",
            expected: "(number & Type<\"int32\"> & Minimum<0>)",
            value: input.page
        }), (Array.isArray(input.items) || _report(_exceptionable, {
            path: _path + ".items",
            expected: "{ id: number & Type<\"int32\">; title: string & MinLength<1>; done: boolean; }[]",
            value: input.items
        })) && input.items.map((elem, _index2) => ("object" === typeof elem && null !== elem || _report(_exceptionable, {
            path: _path + ".items[" + _index2 + "]",
            expected: "{ id: number & Type<\"int32\">; title: string & MinLength<1>; done: boolean; }",
            value: elem
        })) && _vo1(elem, _path + ".items[" + _index2 + "]", true && _exceptionable) || _report(_exceptionable, {
            path: _path + ".items[" + _index2 + "]",
            expected: "{ id: number & Type<\"int32\">; title: string & MinLength<1>; done: boolean; }",
            value: elem
        })).every(flag => flag) || _report(_exceptionable, {
            path: _path + ".items",
            expected: "{ id: number & Type<\"int32\">; title: string & MinLength<1>; done: boolean; }[]",
            value: input.items
        })].every(flag => flag);
    const _vo1 = (input, _path, _exceptionable = true) => ["number" === typeof input.id && (_isTypeInt32_1._isTypeInt32(input.id) || _report(_exceptionable, {
            path: _path + ".id",
            expected: "number & Type<\"int32\">",
            value: input.id
        })) || _report(_exceptionable, {
            path: _path + ".id",
            expected: "(number & Type<\"int32\">)",
            value: input.id
        }), "string" === typeof input.title && (1 <= _stringLength_1._stringLength(input.title) || _report(_exceptionable, {
            path: _path + ".title",
            expected: "string & MinLength<1>",
            value: input.title
        })) || _report(_exceptionable, {
            path: _path + ".title",
            expected: "(string & MinLength<1>)",
            value: input.title
        }), "boolean" === typeof input.done || _report(_exceptionable, {
            path: _path + ".done",
            expected: "boolean",
            value: input.done
        })].every(flag => flag);
    const __is = input => "object" === typeof input && null !== input && _io0(input);
    let errors;
    let _report;
    const __validate = input => {
        if (false === __is(input)) {
            errors = [];
            _report = _validateReport_1._validateReport(errors);
            ((input, _path, _exceptionable = true) => ("object" === typeof input && null !== input || _report(true, {
                path: _path + "",
                expected: "Page",
                value: input
            })) && _vo0(input, _path + "", true) || _report(true, {
                path: _path + "",
                expected: "Page",
                value: input
            }))(input, "$input", true);
            const success = 0 === errors.length;
            return success ? {
                success,
                data: input
            } : {
                success,
                errors,
                data: input
            };
        }
        return {
            success: true,
            data: input
        };
    };
    const __clone = input => _co0(input);
    return input => {
        const result = __validate(input);
        if (result.success)
            result.data = __clone(input);
        return result;
    };
})();
export const isShape = (() => {
    const _io0 = input => "circle" === input.kind && "number" === typeof input.radius;
    const _io1 = input => "rect" === input.kind && "number" === typeof input.w && "number" === typeof input.h;
    const _io2 = input => "label" === input.kind && "string" === typeof input.text && "number" === typeof input.size;
    const _iu0 = input => (() => {
        if ("circle" === input.kind)
            return _io0(input);
        else if ("rect" === input.kind)
            return _io1(input);
        else if ("label" === input.kind)
            return _io2(input);
        else
            return false;
    })();
    return input => "object" === typeof input && null !== input && _iu0(input);
})();
export const validateShape = (() => {
    const _ve0 = "({ kind: \"circle\"; radius: number; } | { kind: \"label\"; text: string; size: number; } | { kind: \"rect\"; w: number; h: number; })";
    const _ve1 = "({ kind: \"circle\"; radius: number; } | { kind: \"rect\"; w: number; h: number; } | { kind: \"label\"; text: string; size: number; })";
    const _co0 = input => ({
        kind: input.kind,
        radius: input.radius
    });
    const _co1 = input => ({
        kind: input.kind,
        w: input.w,
        h: input.h
    });
    const _co2 = input => ({
        kind: input.kind,
        text: input.text,
        size: input.size
    });
    const _cu0 = input => (() => {
        if ("circle" === input.kind)
            return _co0(input);
        else if ("rect" === input.kind)
            return _co1(input);
        else if ("label" === input.kind)
            return _co2(input);
        else
            _throwTypeGuardError_1._throwTypeGuardError({
                method: "plain.createValidateClone",
                expected: "({ kind: \"circle\"; radius: number; } | { kind: \"rect\"; w: number; h: number; } | { kind: \"label\"; text: string; size: number; })",
                value: input
            });
    })();
    const _io0 = input => "circle" === input.kind && "number" === typeof input.radius;
    const _io1 = input => "rect" === input.kind && "number" === typeof input.w && "number" === typeof input.h;
    const _io2 = input => "label" === input.kind && "string" === typeof input.text && "number" === typeof input.size;
    const _iu0 = input => (() => {
        if ("circle" === input.kind)
            return _io0(input);
        else if ("rect" === input.kind)
            return _io1(input);
        else if ("label" === input.kind)
            return _io2(input);
        else
            return false;
    })();
    const _vo0 = (input, _path, _exceptionable = true) => ["circle" === input.kind || _report(_exceptionable, {
            path: _path + ".kind",
            expected: "\"circle\"",
            value: input.kind
        }), "number" === typeof input.radius || _report(_exceptionable, {
            path: _path + ".radius",
            expected: "number",
            value: input.radius
        })].every(flag => flag);
    const _vo1 = (input, _path, _exceptionable = true) => ["rect" === input.kind || _report(_exceptionable, {
            path: _path + ".kind",
            expected: "\"rect\"",
            value: input.kind
        }), "number" === typeof input.w || _report(_exceptionable, {
            path: _path + ".w",
            expected: "number",
            value: input.w
        }), "number" === typeof input.h || _report(_exceptionable, {
            path: _path + ".h",
            expected: "number",
            value: input.h
        })].every(flag => flag);
    const _vo2 = (input, _path, _exceptionable = true) => ["label" === input.kind || _report(_exceptionable, {
            path: _path + ".kind",
            expected: "\"label\"",
            value: input.kind
        }), "string" === typeof input.text || _report(_exceptionable, {
            path: _path + ".text",
            expected: "string",
            value: input.text
        }), "number" === typeof input.size || _report(_exceptionable, {
            path: _path + ".size",
            expected: "number",
            value: input.size
        })].every(flag => flag);
    const _vu0 = (input, _path, _exceptionable = true) => (() => {
        if ("circle" === input.kind)
            return _vo0(input, _path, true && _exceptionable);
        else if ("rect" === input.kind)
            return _vo1(input, _path, true && _exceptionable);
        else if ("label" === input.kind)
            return _vo2(input, _path, true && _exceptionable);
        else
            return _report(_exceptionable, {
                path: _path,
                expected: _ve1,
                value: input
            });
    })();
    const __is = input => "object" === typeof input && null !== input && _iu0(input);
    let errors;
    let _report;
    const __validate = input => {
        if (false === __is(input)) {
            errors = [];
            _report = _validateReport_1._validateReport(errors);
            ((input, _path, _exceptionable = true) => ("object" === typeof input && null !== input || _report(true, {
                path: _path + "",
                expected: _ve0,
                value: input
            })) && _vu0(input, _path + "", true) || _report(true, {
                path: _path + "",
                expected: _ve0,
                value: input
            }))(input, "$input", true);
            const success = 0 === errors.length;
            return success ? {
                success,
                data: input
            } : {
                success,
                errors,
                data: input
            };
        }
        return {
            success: true,
            data: input
        };
    };
    const __clone = input => "object" === typeof input && null !== input ? _cu0(input) : input;
    return input => {
        const result = __validate(input);
        if (result.success)
            result.data = __clone(input);
        return result;
    };
})();
