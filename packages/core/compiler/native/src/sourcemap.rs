// V3 source-map `mappings` for the native JSX transform.
//
// The JS backend applies its sorted, disjoint `{ start, end, text }` edits
// through magic-string and calls `generateMap({ hires: 'boundary' })` after
// prepending the generated preamble (auto-imports + hoisted statics). This
// module produces the SAME `mappings` string from the same inputs, so both
// backends hand Vite an identical map (locked by `native-equivalence.test.ts`).
//
// magic-string's rules, mirrored exactly:
// - Positions are UTF-16 code units (JS string indices), lines split on `\n`
//   only (`\r` is an ordinary character).
// - The prepended preamble and every zero-length insertion (`appendLeft`) only
//   ADVANCE the generated position; they get no segment.
// - An unedited range gets a segment at every word start and at every other
//   UTF-16 code unit (`hires: 'boundary'`).
// - A replacement (`update`) gets one segment at the start of each of its
//   generated lines except a trailing empty one, every segment pointing at the
//   ORIGINAL start of the replaced range.

const B64: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/// One source-side edit, in UTF-8 byte offsets of the original source.
pub struct Edit<'a> {
    pub start: usize,
    pub end: usize,
    pub text: &'a str,
}

struct Encoder {
    // ASCII only (base64 VLQ digits, `,` and `;`), built as bytes.
    out: Vec<u8>,
    gen_col: i64,
    prev_gen_col: i64,
    prev_src_line: i64,
    prev_src_col: i64,
    needs_comma: bool,
}

impl Encoder {
    fn vlq(&mut self, value: i64) {
        let mut num: u64 = if value < 0 {
            (((-value) as u64) << 1) | 1
        } else {
            (value as u64) << 1
        };
        loop {
            let mut digit = (num & 31) as usize;
            num >>= 5;
            if num > 0 {
                digit |= 32;
            }
            self.out.push(B64[digit]);
            if num == 0 {
                break;
            }
        }
    }

    /// Segment `[gen_col, 0, line, col]` at the current generated column.
    fn segment(&mut self, line: i64, col: i64) {
        let g = self.gen_col;
        let (dg, dl, dc) = (
            g - self.prev_gen_col,
            line - self.prev_src_line,
            col - self.prev_src_col,
        );
        self.prev_gen_col = g;
        self.prev_src_line = line;
        self.prev_src_col = col;
        // The common case: the next character of an untouched run, one column
        // on in both texts. Its segment is always `CAAC`.
        if dg == 1 && dl == 0 && dc == 1 && self.needs_comma {
            self.out.extend_from_slice(b",CAAC");
            return;
        }
        if self.needs_comma {
            self.out.push(b',');
        }
        self.needs_comma = true;
        self.vlq(dg);
        // Source index is always 0 (one source), so its delta is always 0.
        self.out.push(b'A');
        self.vlq(dl);
        self.vlq(dc);
    }

    fn next_line(&mut self) {
        self.out.push(b';');
        self.needs_comma = false;
        self.gen_col = 0;
        self.prev_gen_col = 0;
    }

    /// magic-string `Mappings.advance`: generated text with no segments.
    fn advance(&mut self, text: &str) {
        let mut tail = 0i64;
        for ch in text.chars() {
            if ch == '\n' {
                self.next_line();
                tail = 0;
            } else {
                tail += ch.len_utf16() as i64;
            }
        }
        self.gen_col += tail;
    }
}

/// Original-source cursor in magic-string's (line, UTF-16 column) terms.
struct Cursor {
    line: i64,
    col: i64,
}

/// Build the `mappings` string for `preamble + apply(source, edits)`.
/// `edits` must be sorted by `start` and disjoint, exactly as the transform
/// applies them; a zero-length edit is an insertion (`appendLeft`).
pub fn boundary_mappings(source: &str, preamble: &str, edits: &[Edit<'_>]) -> String {
    let mut b = MapBuilder::new(source, preamble);
    for e in edits {
        if e.end > e.start {
            b.replace(e.start, e.end, e.text);
        } else {
            b.insert(e.start, e.text);
        }
    }
    b.finish()
}

/// Incremental form for transforms that interleave insertions and
/// replacements themselves (the plain pre-pass). Calls must arrive in
/// output order: positions never move backwards.
pub struct MapBuilder<'s> {
    source: &'s str,
    enc: Encoder,
    cur: Cursor,
    pos: usize,
}

impl<'s> MapBuilder<'s> {
    pub fn new(source: &'s str, preamble: &str) -> Self {
        let mut enc = Encoder {
            out: Vec::with_capacity(source.len() * 5 + 16),
            gen_col: 0,
            prev_gen_col: 0,
            prev_src_line: 0,
            prev_src_col: 0,
            needs_comma: false,
        };
        enc.advance(preamble);
        MapBuilder {
            source,
            enc,
            cur: Cursor { line: 0, col: 0 },
            pos: 0,
        }
    }

    fn gap_to(&mut self, at: usize) {
        if at > self.pos {
            unedited(&mut self.enc, &mut self.cur, &self.source[self.pos..at]);
            self.pos = at;
        }
    }

    /// Generated text inserted at `at` (`appendLeft` / `appendRight`): it
    /// only advances the generated position.
    pub fn insert(&mut self, at: usize, text: &str) {
        self.gap_to(at);
        self.enc.advance(text);
    }

    /// `[start, end)` replaced by `text` (`update` / `overwrite`, or `remove`
    /// with an empty `text`).
    pub fn replace(&mut self, start: usize, end: usize, text: &str) {
        self.gap_to(start);
        let (line, col) = (self.cur.line, self.cur.col);
        edited(&mut self.enc, line, col, text);
        if end > self.pos {
            skip(&mut self.cur, &self.source[self.pos..end]);
            self.pos = end;
        }
    }

    pub fn finish(mut self) -> String {
        let len = self.source.len();
        self.gap_to(len);
        // Every byte pushed is ASCII.
        String::from_utf8(self.enc.out).expect("source-map mappings are ASCII")
    }
}

/// magic-string `addUneditedChunk` with `hires: 'boundary'`: a segment at the
/// start of every word (`[A-Za-z0-9_]` run) and at every other character.
/// The word state resets per call, as magic-string resets it per chunk, and
/// every edit or insertion point is a chunk boundary there too.
fn unedited(enc: &mut Encoder, cur: &mut Cursor, text: &str) {
    let mut in_word = false;
    if text.is_ascii() {
        // One byte is one UTF-16 unit: skip the char decoding.
        for &b in text.as_bytes() {
            if b == b'\n' {
                cur.line += 1;
                cur.col = 0;
                enc.next_line();
                in_word = false;
                continue;
            }
            let word = b.is_ascii_alphanumeric() || b == b'_';
            if !(word && in_word) {
                enc.segment(cur.line, cur.col);
            }
            in_word = word;
            cur.col += 1;
            enc.gen_col += 1;
        }
        return;
    }
    for ch in text.chars() {
        if ch == '\n' {
            cur.line += 1;
            cur.col = 0;
            enc.next_line();
            in_word = false;
            continue;
        }
        // A non-ASCII character is never a word character to magic-string,
        // and each of its UTF-16 units gets its own segment.
        let word = ch.is_ascii_alphanumeric() || ch == '_';
        for _ in 0..ch.len_utf16() {
            if !(word && in_word) {
                enc.segment(cur.line, cur.col);
            }
            in_word = word;
            cur.col += 1;
            enc.gen_col += 1;
        }
    }
}

fn skip(cur: &mut Cursor, text: &str) {
    for ch in text.chars() {
        if ch == '\n' {
            cur.line += 1;
            cur.col = 0;
        } else {
            cur.col += ch.len_utf16() as i64;
        }
    }
}

/// magic-string `Mappings.addEdit` (no name index).
fn edited(enc: &mut Encoder, line: i64, col: i64, content: &str) {
    if content.is_empty() {
        return;
    }
    let bytes = content.as_bytes();
    let last = bytes.len() - 1;
    let mut line_start = 0usize;
    // A newline that is NOT the final character starts another generated
    // line with its own segment; a trailing one is left to `advance`.
    for (i, b) in bytes.iter().enumerate() {
        if *b == b'\n' && i < last {
            enc.segment(line, col);
            enc.next_line();
            line_start = i + 1;
        }
    }
    enc.segment(line, col);
    enc.advance(&content[line_start..]);
}

// ─── Composition ─────────────────────────────────────────────────────────────
//
// Native twin of `composeMappings` in `src/source-map-compose.ts`, with the
// SAME rules (locked by `sourcemap-positions.test.ts`): for every 4-field
// outer segment, the inner segment at or before its (line, column) on that
// line; no inner segment → the outer one is dropped; a segment tracing to the
// same position as the previous kept one on its line is dropped.

fn b64_value(c: u8) -> Option<i64> {
    match c {
        b'A'..=b'Z' => Some((c - b'A') as i64),
        b'a'..=b'z' => Some((c - b'a') as i64 + 26),
        b'0'..=b'9' => Some((c - b'0') as i64 + 52),
        b'+' => Some(62),
        b'/' => Some(63),
        _ => None,
    }
}

/// Streams the segments of a `mappings` string: `(line, fields, count)` per
/// segment, fields absolute (generated column per line, the rest across the
/// whole map). `None` from `next` ends the stream; malformed input sets
/// `bad`.
struct Segments<'a> {
    bytes: &'a [u8],
    i: usize,
    line: usize,
    gen: i64,
    src: [i64; 3],
    bad: bool,
}

impl<'a> Segments<'a> {
    fn new(mappings: &'a str) -> Self {
        Segments {
            bytes: mappings.as_bytes(),
            i: 0,
            line: 0,
            gen: 0,
            src: [0; 3],
            bad: false,
        }
    }

    fn vlq(&mut self) -> Option<i64> {
        let mut value = 0i64;
        let mut shift = 0u32;
        loop {
            let d = b64_value(*self.bytes.get(self.i)?)?;
            self.i += 1;
            value |= (d & 31) << shift;
            shift += 5;
            if d & 32 == 0 {
                break;
            }
            if shift > 60 {
                return None;
            }
        }
        Some(if value & 1 == 1 { -(value >> 1) } else { value >> 1 })
    }

    /// The next segment as `(line, [gen, srcLine, srcCol], has_source)`.
    fn next(&mut self) -> Option<(usize, [i64; 3], bool)> {
        while self.i < self.bytes.len() {
            match self.bytes[self.i] {
                b';' => {
                    self.line += 1;
                    self.gen = 0;
                    self.i += 1;
                }
                b',' => self.i += 1,
                _ => {
                    let mut n = 0u8;
                    let mut fields = [0i64; 5];
                    while self.i < self.bytes.len()
                        && self.bytes[self.i] != b','
                        && self.bytes[self.i] != b';'
                    {
                        let Some(v) = self.vlq() else {
                            self.bad = true;
                            return None;
                        };
                        if n < 5 {
                            fields[n as usize] = v;
                        }
                        n = n.saturating_add(1);
                    }
                    self.gen += fields[0];
                    if n >= 4 {
                        self.src[0] += fields[1];
                        self.src[1] += fields[2];
                        self.src[2] += fields[3];
                        return Some((self.line, [self.gen, self.src[1], self.src[2]], true));
                    }
                    return Some((self.line, [self.gen, 0, 0], false));
                }
            }
        }
        None
    }
}

/// `outer` maps C → B, `inner` maps B → A: the `mappings` of C → A.
pub fn compose(outer: &str, inner: &str) -> Option<String> {
    // Inner, flat: every segment (1-field ones too, as lookup barriers) and
    // where each line's run starts.
    let mut segs: Vec<([i64; 3], bool)> = Vec::with_capacity(inner.len() / 3);
    let mut line_start: Vec<usize> = vec![0];
    let mut it = Segments::new(inner);
    while let Some((line, seg, has)) = it.next() {
        while line_start.len() <= line {
            line_start.push(segs.len());
        }
        segs.push((seg, has));
    }
    if it.bad {
        return None;
    }
    // Lines after the last segment (trailing `;`) are empty runs.
    let inner_lines = inner.bytes().filter(|b| *b == b';').count() + 1;
    while line_start.len() < inner_lines {
        line_start.push(segs.len());
    }
    line_start.push(segs.len());

    let mut enc = Encoder {
        out: Vec::with_capacity(outer.len()),
        gen_col: 0,
        prev_gen_col: 0,
        prev_src_line: 0,
        prev_src_col: 0,
        needs_comma: false,
    };
    let mut out_line = 0usize;
    let (mut last_line, mut last_col) = (-1i64, -1i64);
    let mut it = Segments::new(outer);
    while let Some((line, seg, has)) = it.next() {
        while out_line < line {
            enc.next_line();
            out_line += 1;
            last_line = -1;
            last_col = -1;
        }
        if !has || seg[1] < 0 || (seg[1] as usize) + 1 >= line_start.len() {
            continue;
        }
        let run = &segs[line_start[seg[1] as usize]..line_start[seg[1] as usize + 1]];
        // The last inner segment whose generated column is <= the column.
        let idx = run.partition_point(|(s, _)| s[0] <= seg[2]);
        if idx == 0 {
            continue;
        }
        let (hit, hit_has) = &run[idx - 1];
        if !hit_has || (hit[1] == last_line && hit[2] == last_col) {
            continue;
        }
        last_line = hit[1];
        last_col = hit[2];
        enc.gen_col = seg[0];
        enc.segment(hit[1], hit[2]);
    }
    if it.bad {
        return None;
    }
    // Trailing empty outer lines.
    let outer_lines = outer.bytes().filter(|b| *b == b';').count();
    while out_line < outer_lines {
        enc.next_line();
        out_line += 1;
    }
    String::from_utf8(enc.out).ok()
}
