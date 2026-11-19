// Generated once from the text of RFC 5545 section 3.8.5.3 (https://www.rfc-editor.org/rfc/rfc5545.txt): the title, the
// DTSTART / EXDATE / RRULE lines and the "==>" result block are the RFC's own words; `expect` is that result block read as wall times.
// `gaps` lists positions after which the RFC elides entries ("..."), `open` is true when the list ends with "...".

export interface RfcExample {
  id: number
  title: string
  dtstart: string
  exdate: string[]
  rrules: string[]
  expect: string[]
  gaps: number[]
  open: boolean
  rfcText: string
}

export const RFC_EXAMPLES: RfcExample[] = [
  {
    "id": 1,
    "title": "Daily for 10 occurrences:",
    "dtstart": "1997-09-02T09:00",
    "exdate": [],
    "rrules": [
      "FREQ=DAILY;COUNT=10"
    ],
    "expect": [
      "1997-09-02T09:00",
      "1997-09-03T09:00",
      "1997-09-04T09:00",
      "1997-09-05T09:00",
      "1997-09-06T09:00",
      "1997-09-07T09:00",
      "1997-09-08T09:00",
      "1997-09-09T09:00",
      "1997-09-10T09:00",
      "1997-09-11T09:00"
    ],
    "gaps": [],
    "open": false,
    "rfcText": "==> (1997 9:00 AM EDT) September 2-11"
  },
  {
    "id": 2,
    "title": "Daily until December 24, 1997:",
    "dtstart": "1997-09-02T09:00",
    "exdate": [],
    "rrules": [
      "FREQ=DAILY;UNTIL=19971224T000000Z"
    ],
    "expect": [
      "1997-09-02T09:00",
      "1997-09-03T09:00",
      "1997-09-04T09:00",
      "1997-09-05T09:00",
      "1997-09-06T09:00",
      "1997-09-07T09:00",
      "1997-09-08T09:00",
      "1997-09-09T09:00",
      "1997-09-10T09:00",
      "1997-09-11T09:00",
      "1997-09-12T09:00",
      "1997-09-13T09:00",
      "1997-09-14T09:00",
      "1997-09-15T09:00",
      "1997-09-16T09:00",
      "1997-09-17T09:00",
      "1997-09-18T09:00",
      "1997-09-19T09:00",
      "1997-09-20T09:00",
      "1997-09-21T09:00",
      "1997-09-22T09:00",
      "1997-09-23T09:00",
      "1997-09-24T09:00",
      "1997-09-25T09:00",
      "1997-09-26T09:00",
      "1997-09-27T09:00",
      "1997-09-28T09:00",
      "1997-09-29T09:00",
      "1997-09-30T09:00",
      "1997-10-01T09:00",
      "1997-10-02T09:00",
      "1997-10-03T09:00",
      "1997-10-04T09:00",
      "1997-10-05T09:00",
      "1997-10-06T09:00",
      "1997-10-07T09:00",
      "1997-10-08T09:00",
      "1997-10-09T09:00",
      "1997-10-10T09:00",
      "1997-10-11T09:00",
      "1997-10-12T09:00",
      "1997-10-13T09:00",
      "1997-10-14T09:00",
      "1997-10-15T09:00",
      "1997-10-16T09:00",
      "1997-10-17T09:00",
      "1997-10-18T09:00",
      "1997-10-19T09:00",
      "1997-10-20T09:00",
      "1997-10-21T09:00",
      "1997-10-22T09:00",
      "1997-10-23T09:00",
      "1997-10-24T09:00",
      "1997-10-25T09:00",
      "1997-10-26T09:00",
      "1997-10-27T09:00",
      "1997-10-28T09:00",
      "1997-10-29T09:00",
      "1997-10-30T09:00",
      "1997-10-31T09:00",
      "1997-11-01T09:00",
      "1997-11-02T09:00",
      "1997-11-03T09:00",
      "1997-11-04T09:00",
      "1997-11-05T09:00",
      "1997-11-06T09:00",
      "1997-11-07T09:00",
      "1997-11-08T09:00",
      "1997-11-09T09:00",
      "1997-11-10T09:00",
      "1997-11-11T09:00",
      "1997-11-12T09:00",
      "1997-11-13T09:00",
      "1997-11-14T09:00",
      "1997-11-15T09:00",
      "1997-11-16T09:00",
      "1997-11-17T09:00",
      "1997-11-18T09:00",
      "1997-11-19T09:00",
      "1997-11-20T09:00",
      "1997-11-21T09:00",
      "1997-11-22T09:00",
      "1997-11-23T09:00",
      "1997-11-24T09:00",
      "1997-11-25T09:00",
      "1997-11-26T09:00",
      "1997-11-27T09:00",
      "1997-11-28T09:00",
      "1997-11-29T09:00",
      "1997-11-30T09:00",
      "1997-12-01T09:00",
      "1997-12-02T09:00",
      "1997-12-03T09:00",
      "1997-12-04T09:00",
      "1997-12-05T09:00",
      "1997-12-06T09:00",
      "1997-12-07T09:00",
      "1997-12-08T09:00",
      "1997-12-09T09:00",
      "1997-12-10T09:00",
      "1997-12-11T09:00",
      "1997-12-12T09:00",
      "1997-12-13T09:00",
      "1997-12-14T09:00",
      "1997-12-15T09:00",
      "1997-12-16T09:00",
      "1997-12-17T09:00",
      "1997-12-18T09:00",
      "1997-12-19T09:00",
      "1997-12-20T09:00",
      "1997-12-21T09:00",
      "1997-12-22T09:00",
      "1997-12-23T09:00"
    ],
    "gaps": [],
    "open": false,
    "rfcText": "==> (1997 9:00 AM EDT) September 2-30;October 1-25\n(1997 9:00 AM EST) October 26-31;November 1-30;December 1-23"
  },
  {
    "id": 3,
    "title": "Every other day - forever:",
    "dtstart": "1997-09-02T09:00",
    "exdate": [],
    "rrules": [
      "FREQ=DAILY;INTERVAL=2"
    ],
    "expect": [
      "1997-09-02T09:00",
      "1997-09-04T09:00",
      "1997-09-06T09:00",
      "1997-09-08T09:00",
      "1997-09-24T09:00",
      "1997-09-26T09:00",
      "1997-09-28T09:00",
      "1997-09-30T09:00",
      "1997-10-02T09:00",
      "1997-10-04T09:00",
      "1997-10-06T09:00",
      "1997-10-20T09:00",
      "1997-10-22T09:00",
      "1997-10-24T09:00",
      "1997-10-26T09:00",
      "1997-10-28T09:00",
      "1997-10-30T09:00",
      "1997-11-01T09:00",
      "1997-11-03T09:00",
      "1997-11-05T09:00",
      "1997-11-07T09:00",
      "1997-11-25T09:00",
      "1997-11-27T09:00",
      "1997-11-29T09:00",
      "1997-12-01T09:00",
      "1997-12-03T09:00"
    ],
    "gaps": [
      3,
      10,
      20,
      25
    ],
    "open": true,
    "rfcText": "==> (1997 9:00 AM EDT) September 2,4,6,8...24,26,28,30;\nOctober 2,4,6...20,22,24\n(1997 9:00 AM EST) October 26,28,30;\nNovember 1,3,5,7...25,27,29;\nDecember 1,3,..."
  },
  {
    "id": 4,
    "title": "Every 10 days, 5 occurrences:",
    "dtstart": "1997-09-02T09:00",
    "exdate": [],
    "rrules": [
      "FREQ=DAILY;INTERVAL=10;COUNT=5"
    ],
    "expect": [
      "1997-09-02T09:00",
      "1997-09-12T09:00",
      "1997-09-22T09:00",
      "1997-10-02T09:00",
      "1997-10-12T09:00"
    ],
    "gaps": [],
    "open": false,
    "rfcText": "==> (1997 9:00 AM EDT) September 2,12,22;\nOctober 2,12"
  },
  {
    "id": 5,
    "title": "Every day in January, for 3 years:",
    "dtstart": "1998-01-01T09:00",
    "exdate": [],
    "rrules": [
      "FREQ=YEARLY;UNTIL=20000131T140000Z;BYMONTH=1;BYDAY=SU,MO,TU,WE,TH,FR,SA",
      "FREQ=DAILY;UNTIL=20000131T140000Z;BYMONTH=1"
    ],
    "expect": [
      "1998-01-01T09:00",
      "1998-01-02T09:00",
      "1998-01-03T09:00",
      "1998-01-04T09:00",
      "1998-01-05T09:00",
      "1998-01-06T09:00",
      "1998-01-07T09:00",
      "1998-01-08T09:00",
      "1998-01-09T09:00",
      "1998-01-10T09:00",
      "1998-01-11T09:00",
      "1998-01-12T09:00",
      "1998-01-13T09:00",
      "1998-01-14T09:00",
      "1998-01-15T09:00",
      "1998-01-16T09:00",
      "1998-01-17T09:00",
      "1998-01-18T09:00",
      "1998-01-19T09:00",
      "1998-01-20T09:00",
      "1998-01-21T09:00",
      "1998-01-22T09:00",
      "1998-01-23T09:00",
      "1998-01-24T09:00",
      "1998-01-25T09:00",
      "1998-01-26T09:00",
      "1998-01-27T09:00",
      "1998-01-28T09:00",
      "1998-01-29T09:00",
      "1998-01-30T09:00",
      "1998-01-31T09:00",
      "1999-01-01T09:00",
      "1999-01-02T09:00",
      "1999-01-03T09:00",
      "1999-01-04T09:00",
      "1999-01-05T09:00",
      "1999-01-06T09:00",
      "1999-01-07T09:00",
      "1999-01-08T09:00",
      "1999-01-09T09:00",
      "1999-01-10T09:00",
      "1999-01-11T09:00",
      "1999-01-12T09:00",
      "1999-01-13T09:00",
      "1999-01-14T09:00",
      "1999-01-15T09:00",
      "1999-01-16T09:00",
      "1999-01-17T09:00",
      "1999-01-18T09:00",
      "1999-01-19T09:00",
      "1999-01-20T09:00",
      "1999-01-21T09:00",
      "1999-01-22T09:00",
      "1999-01-23T09:00",
      "1999-01-24T09:00",
      "1999-01-25T09:00",
      "1999-01-26T09:00",
      "1999-01-27T09:00",
      "1999-01-28T09:00",
      "1999-01-29T09:00",
      "1999-01-30T09:00",
      "1999-01-31T09:00",
      "2000-01-01T09:00",
      "2000-01-02T09:00",
      "2000-01-03T09:00",
      "2000-01-04T09:00",
      "2000-01-05T09:00",
      "2000-01-06T09:00",
      "2000-01-07T09:00",
      "2000-01-08T09:00",
      "2000-01-09T09:00",
      "2000-01-10T09:00",
      "2000-01-11T09:00",
      "2000-01-12T09:00",
      "2000-01-13T09:00",
      "2000-01-14T09:00",
      "2000-01-15T09:00",
      "2000-01-16T09:00",
      "2000-01-17T09:00",
      "2000-01-18T09:00",
      "2000-01-19T09:00",
      "2000-01-20T09:00",
      "2000-01-21T09:00",
      "2000-01-22T09:00",
      "2000-01-23T09:00",
      "2000-01-24T09:00",
      "2000-01-25T09:00",
      "2000-01-26T09:00",
      "2000-01-27T09:00",
      "2000-01-28T09:00",
      "2000-01-29T09:00",
      "2000-01-30T09:00",
      "2000-01-31T09:00"
    ],
    "gaps": [],
    "open": false,
    "rfcText": "==> (1998 9:00 AM EST)January 1-31\n(1999 9:00 AM EST)January 1-31\n(2000 9:00 AM EST)January 1-31"
  },
  {
    "id": 6,
    "title": "Weekly for 10 occurrences:",
    "dtstart": "1997-09-02T09:00",
    "exdate": [],
    "rrules": [
      "FREQ=WEEKLY;COUNT=10"
    ],
    "expect": [
      "1997-09-02T09:00",
      "1997-09-09T09:00",
      "1997-09-16T09:00",
      "1997-09-23T09:00",
      "1997-09-30T09:00",
      "1997-10-07T09:00",
      "1997-10-14T09:00",
      "1997-10-21T09:00",
      "1997-10-28T09:00",
      "1997-11-04T09:00"
    ],
    "gaps": [],
    "open": false,
    "rfcText": "==> (1997 9:00 AM EDT) September 2,9,16,23,30;October 7,14,21\n(1997 9:00 AM EST) October 28;November 4"
  },
  {
    "id": 7,
    "title": "Weekly until December 24, 1997:",
    "dtstart": "1997-09-02T09:00",
    "exdate": [],
    "rrules": [
      "FREQ=WEEKLY;UNTIL=19971224T000000Z"
    ],
    "expect": [
      "1997-09-02T09:00",
      "1997-09-09T09:00",
      "1997-09-16T09:00",
      "1997-09-23T09:00",
      "1997-09-30T09:00",
      "1997-10-07T09:00",
      "1997-10-14T09:00",
      "1997-10-21T09:00",
      "1997-10-28T09:00",
      "1997-11-04T09:00",
      "1997-11-11T09:00",
      "1997-11-18T09:00",
      "1997-11-25T09:00",
      "1997-12-02T09:00",
      "1997-12-09T09:00",
      "1997-12-16T09:00",
      "1997-12-23T09:00"
    ],
    "gaps": [],
    "open": false,
    "rfcText": "==> (1997 9:00 AM EDT) September 2,9,16,23,30;\nOctober 7,14,21\n(1997 9:00 AM EST) October 28;\nNovember 4,11,18,25;\nDecember 2,9,16,23"
  },
  {
    "id": 8,
    "title": "Every other week - forever:",
    "dtstart": "1997-09-02T09:00",
    "exdate": [],
    "rrules": [
      "FREQ=WEEKLY;INTERVAL=2;WKST=SU"
    ],
    "expect": [
      "1997-09-02T09:00",
      "1997-09-16T09:00",
      "1997-09-30T09:00",
      "1997-10-14T09:00",
      "1997-10-28T09:00",
      "1997-11-11T09:00",
      "1997-11-25T09:00",
      "1997-12-09T09:00",
      "1997-12-23T09:00",
      "1998-01-06T09:00",
      "1998-01-20T09:00",
      "1998-02-03T09:00",
      "1998-02-17T09:00"
    ],
    "gaps": [
      12
    ],
    "open": true,
    "rfcText": "==> (1997 9:00 AM EDT) September 2,16,30;\nOctober 14\n(1997 9:00 AM EST) October 28;\nNovember 11,25;\nDecember 9,23\n(1998 9:00 AM EST) January 6,20;\nFebruary 3, 17\n..."
  },
  {
    "id": 9,
    "title": "Weekly on Tuesday and Thursday for five weeks:",
    "dtstart": "1997-09-02T09:00",
    "exdate": [],
    "rrules": [
      "FREQ=WEEKLY;UNTIL=19971007T000000Z;WKST=SU;BYDAY=TU,TH",
      "FREQ=WEEKLY;COUNT=10;WKST=SU;BYDAY=TU,TH"
    ],
    "expect": [
      "1997-09-02T09:00",
      "1997-09-04T09:00",
      "1997-09-09T09:00",
      "1997-09-11T09:00",
      "1997-09-16T09:00",
      "1997-09-18T09:00",
      "1997-09-23T09:00",
      "1997-09-25T09:00",
      "1997-09-30T09:00",
      "1997-10-02T09:00"
    ],
    "gaps": [],
    "open": false,
    "rfcText": "==> (1997 9:00 AM EDT) September 2,4,9,11,16,18,23,25,30;\nOctober 2"
  },
  {
    "id": 10,
    "title": "Every other week on Monday, Wednesday, and Friday until December 24, 1997, starting on Monday, September 1, 1997:",
    "dtstart": "1997-09-01T09:00",
    "exdate": [],
    "rrules": [
      "FREQ=WEEKLY;INTERVAL=2;UNTIL=19971224T000000Z;WKST=SU;BYDAY=MO,WE,FR"
    ],
    "expect": [
      "1997-09-01T09:00",
      "1997-09-03T09:00",
      "1997-09-05T09:00",
      "1997-09-15T09:00",
      "1997-09-17T09:00",
      "1997-09-19T09:00",
      "1997-09-29T09:00",
      "1997-10-01T09:00",
      "1997-10-03T09:00",
      "1997-10-13T09:00",
      "1997-10-15T09:00",
      "1997-10-17T09:00",
      "1997-10-27T09:00",
      "1997-10-29T09:00",
      "1997-10-31T09:00",
      "1997-11-10T09:00",
      "1997-11-12T09:00",
      "1997-11-14T09:00",
      "1997-11-24T09:00",
      "1997-11-26T09:00",
      "1997-11-28T09:00",
      "1997-12-08T09:00",
      "1997-12-10T09:00",
      "1997-12-12T09:00",
      "1997-12-22T09:00"
    ],
    "gaps": [],
    "open": false,
    "rfcText": "==> (1997 9:00 AM EDT) September 1,3,5,15,17,19,29;\nOctober 1,3,13,15,17\n(1997 9:00 AM EST) October 27,29,31;\nNovember 10,12,14,24,26,28;\nDecember 8,10,12,22"
  },
  {
    "id": 11,
    "title": "Every other week on Tuesday and Thursday, for 8 occurrences:",
    "dtstart": "1997-09-02T09:00",
    "exdate": [],
    "rrules": [
      "FREQ=WEEKLY;INTERVAL=2;COUNT=8;WKST=SU;BYDAY=TU,TH"
    ],
    "expect": [
      "1997-09-02T09:00",
      "1997-09-04T09:00",
      "1997-09-16T09:00",
      "1997-09-18T09:00",
      "1997-09-30T09:00",
      "1997-10-02T09:00",
      "1997-10-14T09:00",
      "1997-10-16T09:00"
    ],
    "gaps": [],
    "open": false,
    "rfcText": "==> (1997 9:00 AM EDT) September 2,4,16,18,30;\nOctober 2,14,16"
  },
  {
    "id": 12,
    "title": "Monthly on the first Friday for 10 occurrences:",
    "dtstart": "1997-09-05T09:00",
    "exdate": [],
    "rrules": [
      "FREQ=MONTHLY;COUNT=10;BYDAY=1FR"
    ],
    "expect": [
      "1997-09-05T09:00",
      "1997-10-03T09:00",
      "1997-11-07T09:00",
      "1997-12-05T09:00",
      "1998-01-02T09:00",
      "1998-02-06T09:00",
      "1998-03-06T09:00",
      "1998-04-03T09:00",
      "1998-05-01T09:00",
      "1998-06-05T09:00"
    ],
    "gaps": [],
    "open": false,
    "rfcText": "==> (1997 9:00 AM EDT) September 5;October 3\n(1997 9:00 AM EST) November 7;December 5\n(1998 9:00 AM EST) January 2;February 6;March 6;April 3\n(1998 9:00 AM EDT) May 1;June 5"
  },
  {
    "id": 13,
    "title": "Monthly on the first Friday until December 24, 1997:",
    "dtstart": "1997-09-05T09:00",
    "exdate": [],
    "rrules": [
      "FREQ=MONTHLY;UNTIL=19971224T000000Z;BYDAY=1FR"
    ],
    "expect": [
      "1997-09-05T09:00",
      "1997-10-03T09:00",
      "1997-11-07T09:00",
      "1997-12-05T09:00"
    ],
    "gaps": [],
    "open": false,
    "rfcText": "==> (1997 9:00 AM EDT) September 5; October 3\n(1997 9:00 AM EST) November 7; December 5"
  },
  {
    "id": 14,
    "title": "Every other month on the first and last Sunday of the month for 10 occurrences:",
    "dtstart": "1997-09-07T09:00",
    "exdate": [],
    "rrules": [
      "FREQ=MONTHLY;INTERVAL=2;COUNT=10;BYDAY=1SU,-1SU"
    ],
    "expect": [
      "1997-09-07T09:00",
      "1997-09-28T09:00",
      "1997-11-02T09:00",
      "1997-11-30T09:00",
      "1998-01-04T09:00",
      "1998-01-25T09:00",
      "1998-03-01T09:00",
      "1998-03-29T09:00",
      "1998-05-03T09:00",
      "1998-05-31T09:00"
    ],
    "gaps": [],
    "open": false,
    "rfcText": "==> (1997 9:00 AM EDT) September 7,28\n(1997 9:00 AM EST) November 2,30\n(1998 9:00 AM EST) January 4,25;March 1,29\n(1998 9:00 AM EDT) May 3,31"
  },
  {
    "id": 15,
    "title": "Monthly on the second-to-last Monday of the month for 6 months:",
    "dtstart": "1997-09-22T09:00",
    "exdate": [],
    "rrules": [
      "FREQ=MONTHLY;COUNT=6;BYDAY=-2MO"
    ],
    "expect": [
      "1997-09-22T09:00",
      "1997-10-20T09:00",
      "1997-11-17T09:00",
      "1997-12-22T09:00",
      "1998-01-19T09:00",
      "1998-02-16T09:00"
    ],
    "gaps": [],
    "open": false,
    "rfcText": "==> (1997 9:00 AM EDT) September 22;October 20\n(1997 9:00 AM EST) November 17;December 22\n(1998 9:00 AM EST) January 19;February 16"
  },
  {
    "id": 16,
    "title": "Monthly on the third-to-the-last day of the month, forever:",
    "dtstart": "1997-09-28T09:00",
    "exdate": [],
    "rrules": [
      "FREQ=MONTHLY;BYMONTHDAY=-3"
    ],
    "expect": [
      "1997-09-28T09:00",
      "1997-10-29T09:00",
      "1997-11-28T09:00",
      "1997-12-29T09:00",
      "1998-01-29T09:00",
      "1998-02-26T09:00"
    ],
    "gaps": [
      5
    ],
    "open": true,
    "rfcText": "==> (1997 9:00 AM EDT) September 28\n(1997 9:00 AM EST) October 29;November 28;December 29\n(1998 9:00 AM EST) January 29;February 26\n..."
  },
  {
    "id": 17,
    "title": "Monthly on the 2nd and 15th of the month for 10 occurrences:",
    "dtstart": "1997-09-02T09:00",
    "exdate": [],
    "rrules": [
      "FREQ=MONTHLY;COUNT=10;BYMONTHDAY=2,15"
    ],
    "expect": [
      "1997-09-02T09:00",
      "1997-09-15T09:00",
      "1997-10-02T09:00",
      "1997-10-15T09:00",
      "1997-11-02T09:00",
      "1997-11-15T09:00",
      "1997-12-02T09:00",
      "1997-12-15T09:00",
      "1998-01-02T09:00",
      "1998-01-15T09:00"
    ],
    "gaps": [],
    "open": false,
    "rfcText": "==> (1997 9:00 AM EDT) September 2,15;October 2,15\n(1997 9:00 AM EST) November 2,15;December 2,15\n(1998 9:00 AM EST) January 2,15"
  },
  {
    "id": 18,
    "title": "Monthly on the first and last day of the month for 10 occurrences:",
    "dtstart": "1997-09-30T09:00",
    "exdate": [],
    "rrules": [
      "FREQ=MONTHLY;COUNT=10;BYMONTHDAY=1,-1"
    ],
    "expect": [
      "1997-09-30T09:00",
      "1997-10-01T09:00",
      "1997-10-31T09:00",
      "1997-11-01T09:00",
      "1997-11-30T09:00",
      "1997-12-01T09:00",
      "1997-12-31T09:00",
      "1998-01-01T09:00",
      "1998-01-31T09:00",
      "1998-02-01T09:00"
    ],
    "gaps": [],
    "open": false,
    "rfcText": "==> (1997 9:00 AM EDT) September 30;October 1\n(1997 9:00 AM EST) October 31;November 1,30;December 1,31\n(1998 9:00 AM EST) January 1,31;February 1"
  },
  {
    "id": 19,
    "title": "Every 18 months on the 10th thru 15th of the month for 10 occurrences:",
    "dtstart": "1997-09-10T09:00",
    "exdate": [],
    "rrules": [
      "FREQ=MONTHLY;INTERVAL=18;COUNT=10;BYMONTHDAY=10,11,12,13,14,15"
    ],
    "expect": [
      "1997-09-10T09:00",
      "1997-09-11T09:00",
      "1997-09-12T09:00",
      "1997-09-13T09:00",
      "1997-09-14T09:00",
      "1997-09-15T09:00",
      "1999-03-10T09:00",
      "1999-03-11T09:00",
      "1999-03-12T09:00",
      "1999-03-13T09:00"
    ],
    "gaps": [],
    "open": false,
    "rfcText": "==> (1997 9:00 AM EDT) September 10,11,12,13,14,15\n(1999 9:00 AM EST) March 10,11,12,13"
  },
  {
    "id": 20,
    "title": "Every Tuesday, every other month:",
    "dtstart": "1997-09-02T09:00",
    "exdate": [],
    "rrules": [
      "FREQ=MONTHLY;INTERVAL=2;BYDAY=TU"
    ],
    "expect": [
      "1997-09-02T09:00",
      "1997-09-09T09:00",
      "1997-09-16T09:00",
      "1997-09-23T09:00",
      "1997-09-30T09:00",
      "1997-11-04T09:00",
      "1997-11-11T09:00",
      "1997-11-18T09:00",
      "1997-11-25T09:00",
      "1998-01-06T09:00",
      "1998-01-13T09:00",
      "1998-01-20T09:00",
      "1998-01-27T09:00",
      "1998-03-03T09:00",
      "1998-03-10T09:00",
      "1998-03-17T09:00",
      "1998-03-24T09:00",
      "1998-03-31T09:00"
    ],
    "gaps": [
      17
    ],
    "open": true,
    "rfcText": "==> (1997 9:00 AM EDT) September 2,9,16,23,30\n(1997 9:00 AM EST) November 4,11,18,25\n(1998 9:00 AM EST) January 6,13,20,27;March 3,10,17,24,31\n..."
  },
  {
    "id": 21,
    "title": "Yearly in June and July for 10 occurrences:",
    "dtstart": "1997-06-10T09:00",
    "exdate": [],
    "rrules": [
      "FREQ=YEARLY;COUNT=10;BYMONTH=6,7"
    ],
    "expect": [
      "1997-06-10T09:00",
      "1997-07-10T09:00",
      "1998-06-10T09:00",
      "1998-07-10T09:00",
      "1999-06-10T09:00",
      "1999-07-10T09:00",
      "2000-06-10T09:00",
      "2000-07-10T09:00",
      "2001-06-10T09:00",
      "2001-07-10T09:00"
    ],
    "gaps": [],
    "open": false,
    "rfcText": "==> (1997 9:00 AM EDT) June 10;July 10\n(1998 9:00 AM EDT) June 10;July 10\n(1999 9:00 AM EDT) June 10;July 10\n(2000 9:00 AM EDT) June 10;July 10\n(2001 9:00 AM EDT) June 10;July 10\nNote: Since none of the BYDAY, BYMONTHDAY, or BYYEARDAY\ncomponents are specified, the day is gotten from \"DTSTART\"."
  },
  {
    "id": 22,
    "title": "Every other year on January, February, and March for 10 occurrences:",
    "dtstart": "1997-03-10T09:00",
    "exdate": [],
    "rrules": [
      "FREQ=YEARLY;INTERVAL=2;COUNT=10;BYMONTH=1,2,3"
    ],
    "expect": [
      "1997-03-10T09:00",
      "1999-01-10T09:00",
      "1999-02-10T09:00",
      "1999-03-10T09:00",
      "2001-01-10T09:00",
      "2001-02-10T09:00",
      "2001-03-10T09:00",
      "2003-01-10T09:00",
      "2003-02-10T09:00",
      "2003-03-10T09:00"
    ],
    "gaps": [],
    "open": false,
    "rfcText": "==> (1997 9:00 AM EST) March 10\n(1999 9:00 AM EST) January 10;February 10;March 10\n(2001 9:00 AM EST) January 10;February 10;March 10\n(2003 9:00 AM EST) January 10;February 10;March 10"
  },
  {
    "id": 23,
    "title": "Every third year on the 1st, 100th, and 200th day for 10 occurrences:",
    "dtstart": "1997-01-01T09:00",
    "exdate": [],
    "rrules": [
      "FREQ=YEARLY;INTERVAL=3;COUNT=10;BYYEARDAY=1,100,200"
    ],
    "expect": [
      "1997-01-01T09:00",
      "1997-04-10T09:00",
      "1997-07-19T09:00",
      "2000-01-01T09:00",
      "2000-04-09T09:00",
      "2000-07-18T09:00",
      "2003-01-01T09:00",
      "2003-04-10T09:00",
      "2003-07-19T09:00",
      "2006-01-01T09:00"
    ],
    "gaps": [],
    "open": false,
    "rfcText": "==> (1997 9:00 AM EST) January 1\n(1997 9:00 AM EDT) April 10;July 19\n(2000 9:00 AM EST) January 1\n(2000 9:00 AM EDT) April 9;July 18\n(2003 9:00 AM EST) January 1\n(2003 9:00 AM EDT) April 10;July 19\n(2006 9:00 AM EST) January 1"
  },
  {
    "id": 24,
    "title": "Every 20th Monday of the year, forever:",
    "dtstart": "1997-05-19T09:00",
    "exdate": [],
    "rrules": [
      "FREQ=YEARLY;BYDAY=20MO"
    ],
    "expect": [
      "1997-05-19T09:00",
      "1998-05-18T09:00",
      "1999-05-17T09:00"
    ],
    "gaps": [
      2
    ],
    "open": true,
    "rfcText": "==> (1997 9:00 AM EDT) May 19\n(1998 9:00 AM EDT) May 18\n(1999 9:00 AM EDT) May 17\n..."
  },
  {
    "id": 25,
    "title": "Monday of week number 20 (where the default start of the week is Monday), forever:",
    "dtstart": "1997-05-12T09:00",
    "exdate": [],
    "rrules": [
      "FREQ=YEARLY;BYWEEKNO=20;BYDAY=MO"
    ],
    "expect": [
      "1997-05-12T09:00",
      "1998-05-11T09:00",
      "1999-05-17T09:00"
    ],
    "gaps": [
      2
    ],
    "open": true,
    "rfcText": "==> (1997 9:00 AM EDT) May 12\n(1998 9:00 AM EDT) May 11\n(1999 9:00 AM EDT) May 17\n..."
  },
  {
    "id": 26,
    "title": "Every Thursday in March, forever:",
    "dtstart": "1997-03-13T09:00",
    "exdate": [],
    "rrules": [
      "FREQ=YEARLY;BYMONTH=3;BYDAY=TH"
    ],
    "expect": [
      "1997-03-13T09:00",
      "1997-03-20T09:00",
      "1997-03-27T09:00",
      "1998-03-05T09:00",
      "1998-03-12T09:00",
      "1998-03-19T09:00",
      "1998-03-26T09:00",
      "1999-03-04T09:00",
      "1999-03-11T09:00",
      "1999-03-18T09:00",
      "1999-03-25T09:00"
    ],
    "gaps": [
      10
    ],
    "open": true,
    "rfcText": "==> (1997 9:00 AM EST) March 13,20,27\n(1998 9:00 AM EST) March 5,12,19,26\n(1999 9:00 AM EST) March 4,11,18,25\n..."
  },
  {
    "id": 27,
    "title": "Every Thursday, but only during June, July, and August, forever:",
    "dtstart": "1997-06-05T09:00",
    "exdate": [],
    "rrules": [
      "FREQ=YEARLY;BYDAY=TH;BYMONTH=6,7,8"
    ],
    "expect": [
      "1997-06-05T09:00",
      "1997-06-12T09:00",
      "1997-06-19T09:00",
      "1997-06-26T09:00",
      "1997-07-03T09:00",
      "1997-07-10T09:00",
      "1997-07-17T09:00",
      "1997-07-24T09:00",
      "1997-07-31T09:00",
      "1997-08-07T09:00",
      "1997-08-14T09:00",
      "1997-08-21T09:00",
      "1997-08-28T09:00",
      "1998-06-04T09:00",
      "1998-06-11T09:00",
      "1998-06-18T09:00",
      "1998-06-25T09:00",
      "1998-07-02T09:00",
      "1998-07-09T09:00",
      "1998-07-16T09:00",
      "1998-07-23T09:00",
      "1998-07-30T09:00",
      "1998-08-06T09:00",
      "1998-08-13T09:00",
      "1998-08-20T09:00",
      "1998-08-27T09:00",
      "1999-06-03T09:00",
      "1999-06-10T09:00",
      "1999-06-17T09:00",
      "1999-06-24T09:00",
      "1999-07-01T09:00",
      "1999-07-08T09:00",
      "1999-07-15T09:00",
      "1999-07-22T09:00",
      "1999-07-29T09:00",
      "1999-08-05T09:00",
      "1999-08-12T09:00",
      "1999-08-19T09:00",
      "1999-08-26T09:00"
    ],
    "gaps": [
      38
    ],
    "open": true,
    "rfcText": "==> (1997 9:00 AM EDT) June 5,12,19,26;July 3,10,17,24,31;\nAugust 7,14,21,28\n(1998 9:00 AM EDT) June 4,11,18,25;July 2,9,16,23,30;\nAugust 6,13,20,27\n(1999 9:00 AM EDT) June 3,10,17,24;July 1,8,15,22,29;\nAugust 5,12,19,26\n..."
  },
  {
    "id": 28,
    "title": "Every Friday the 13th, forever:",
    "dtstart": "1997-09-02T09:00",
    "exdate": [
      "1997-09-02T09:00"
    ],
    "rrules": [
      "FREQ=MONTHLY;BYDAY=FR;BYMONTHDAY=13"
    ],
    "expect": [
      "1998-02-13T09:00",
      "1998-03-13T09:00",
      "1998-11-13T09:00",
      "1999-08-13T09:00",
      "2000-10-13T09:00"
    ],
    "gaps": [
      4
    ],
    "open": true,
    "rfcText": "==> (1998 9:00 AM EST) February 13;March 13;November 13\n(1999 9:00 AM EDT) August 13\n(2000 9:00 AM EDT) October 13\n..."
  },
  {
    "id": 29,
    "title": "The first Saturday that follows the first Sunday of the month, forever:",
    "dtstart": "1997-09-13T09:00",
    "exdate": [],
    "rrules": [
      "FREQ=MONTHLY;BYDAY=SA;BYMONTHDAY=7,8,9,10,11,12,13"
    ],
    "expect": [
      "1997-09-13T09:00",
      "1997-10-11T09:00",
      "1997-11-08T09:00",
      "1997-12-13T09:00",
      "1998-01-10T09:00",
      "1998-02-07T09:00",
      "1998-03-07T09:00",
      "1998-04-11T09:00",
      "1998-05-09T09:00",
      "1998-06-13T09:00"
    ],
    "gaps": [
      9,
      9
    ],
    "open": true,
    "rfcText": "==> (1997 9:00 AM EDT) September 13;October 11\n(1997 9:00 AM EST) November 8;December 13\n(1998 9:00 AM EST) January 10;February 7;March 7\n(1998 9:00 AM EDT) April 11;May 9;June 13...\n..."
  },
  {
    "id": 30,
    "title": "Every 4 years, the first Tuesday after a Monday in November, forever (U.S. Presidential Election day):",
    "dtstart": "1996-11-05T09:00",
    "exdate": [],
    "rrules": [
      "FREQ=YEARLY;INTERVAL=4;BYMONTH=11;BYDAY=TU;BYMONTHDAY=2,3,4,5,6,7,8"
    ],
    "expect": [
      "1996-11-05T09:00",
      "2000-11-07T09:00",
      "2004-11-02T09:00"
    ],
    "gaps": [
      2
    ],
    "open": true,
    "rfcText": "==> (1996 9:00 AM EST) November 5\n(2000 9:00 AM EST) November 7\n(2004 9:00 AM EST) November 2\n..."
  },
  {
    "id": 31,
    "title": "The third instance into the month of one of Tuesday, Wednesday, or Thursday, for the next 3 months:",
    "dtstart": "1997-09-04T09:00",
    "exdate": [],
    "rrules": [
      "FREQ=MONTHLY;COUNT=3;BYDAY=TU,WE,TH;BYSETPOS=3"
    ],
    "expect": [
      "1997-09-04T09:00",
      "1997-10-07T09:00",
      "1997-11-06T09:00"
    ],
    "gaps": [],
    "open": false,
    "rfcText": "==> (1997 9:00 AM EDT) September 4;October 7\n(1997 9:00 AM EST) November 6"
  },
  {
    "id": 32,
    "title": "The second-to-last weekday of the month:",
    "dtstart": "1997-09-29T09:00",
    "exdate": [],
    "rrules": [
      "FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-2"
    ],
    "expect": [
      "1997-09-29T09:00",
      "1997-10-30T09:00",
      "1997-11-27T09:00",
      "1997-12-30T09:00",
      "1998-01-29T09:00",
      "1998-02-26T09:00",
      "1998-03-30T09:00"
    ],
    "gaps": [
      6
    ],
    "open": true,
    "rfcText": "==> (1997 9:00 AM EDT) September 29\n(1997 9:00 AM EST) October 30;November 27;December 30\n(1998 9:00 AM EST) January 29;February 26;March 30\n..."
  },
  {
    "id": 33,
    "title": "Every 3 hours from 9:00 AM to 5:00 PM on a specific day:",
    "dtstart": "1997-09-02T09:00",
    "exdate": [],
    "rrules": [
      "FREQ=HOURLY;INTERVAL=3;UNTIL=19970902T170000Z"
    ],
    "expect": [
      "1997-09-02T09:00",
      "1997-09-02T12:00",
      "1997-09-02T15:00"
    ],
    "gaps": [],
    "open": false,
    "rfcText": "==> (September 2, 1997 EDT) 09:00,12:00,15:00"
  },
  {
    "id": 34,
    "title": "Every 15 minutes for 6 occurrences:",
    "dtstart": "1997-09-02T09:00",
    "exdate": [],
    "rrules": [
      "FREQ=MINUTELY;INTERVAL=15;COUNT=6"
    ],
    "expect": [
      "1997-09-02T09:00",
      "1997-09-02T09:15",
      "1997-09-02T09:30",
      "1997-09-02T09:45",
      "1997-09-02T10:00",
      "1997-09-02T10:15"
    ],
    "gaps": [],
    "open": false,
    "rfcText": "==> (September 2, 1997 EDT) 09:00,09:15,09:30,09:45,10:00,10:15"
  },
  {
    "id": 35,
    "title": "Every hour and a half for 4 occurrences:",
    "dtstart": "1997-09-02T09:00",
    "exdate": [],
    "rrules": [
      "FREQ=MINUTELY;INTERVAL=90;COUNT=4"
    ],
    "expect": [
      "1997-09-02T09:00",
      "1997-09-02T10:30",
      "1997-09-02T12:00",
      "1997-09-02T13:30"
    ],
    "gaps": [],
    "open": false,
    "rfcText": "==> (September 2, 1997 EDT) 09:00,10:30;12:00;13:30"
  },
  {
    "id": 36,
    "title": "Every 20 minutes from 9:00 AM to 4:40 PM every day:",
    "dtstart": "1997-09-02T09:00",
    "exdate": [],
    "rrules": [
      "FREQ=DAILY;BYHOUR=9,10,11,12,13,14,15,16;BYMINUTE=0,20,40",
      "FREQ=MINUTELY;INTERVAL=20;BYHOUR=9,10,11,12,13,14,15,16"
    ],
    "expect": [
      "1997-09-02T09:00",
      "1997-09-02T09:20",
      "1997-09-02T09:40",
      "1997-09-02T10:00",
      "1997-09-02T10:20",
      "1997-09-02T10:40",
      "1997-09-02T11:00",
      "1997-09-02T11:20",
      "1997-09-02T11:40",
      "1997-09-02T12:00",
      "1997-09-02T12:20",
      "1997-09-02T12:40",
      "1997-09-02T13:00",
      "1997-09-02T13:20",
      "1997-09-02T13:40",
      "1997-09-02T14:00",
      "1997-09-02T14:20",
      "1997-09-02T14:40",
      "1997-09-02T15:00",
      "1997-09-02T15:20",
      "1997-09-02T15:40",
      "1997-09-02T16:00",
      "1997-09-02T16:20",
      "1997-09-02T16:40",
      "1997-09-03T09:00",
      "1997-09-03T09:20",
      "1997-09-03T09:40",
      "1997-09-03T10:00",
      "1997-09-03T10:20",
      "1997-09-03T10:40",
      "1997-09-03T11:00",
      "1997-09-03T11:20",
      "1997-09-03T11:40",
      "1997-09-03T12:00",
      "1997-09-03T12:20",
      "1997-09-03T12:40",
      "1997-09-03T13:00",
      "1997-09-03T13:20",
      "1997-09-03T13:40",
      "1997-09-03T14:00",
      "1997-09-03T14:20",
      "1997-09-03T14:40",
      "1997-09-03T15:00",
      "1997-09-03T15:20",
      "1997-09-03T15:40",
      "1997-09-03T16:00",
      "1997-09-03T16:20",
      "1997-09-03T16:40"
    ],
    "gaps": [],
    "open": true,
    "rfcText": "==> (September 2, 1997 EDT) 9:00,9:20,9:40,10:00,10:20,\n... 16:00,16:20,16:40\n(September 3, 1997 EDT) 9:00,9:20,9:40,10:00,10:20,\n...16:00,16:20,16:40\n..."
  },
  {
    "id": 37,
    "title": "An example where the days generated makes a difference because of WKST:",
    "dtstart": "1997-08-05T09:00",
    "exdate": [],
    "rrules": [
      "FREQ=WEEKLY;INTERVAL=2;COUNT=4;BYDAY=TU,SU;WKST=MO"
    ],
    "expect": [
      "1997-08-05T09:00",
      "1997-08-10T09:00",
      "1997-08-19T09:00",
      "1997-08-24T09:00"
    ],
    "gaps": [],
    "open": false,
    "rfcText": "==> (1997 EDT) August 5,10,19,24"
  },
  {
    "id": 38,
    "title": "changing only WKST from MO to SU, yields different results...",
    "dtstart": "1997-08-05T09:00",
    "exdate": [],
    "rrules": [
      "FREQ=WEEKLY;INTERVAL=2;COUNT=4;BYDAY=TU,SU;WKST=SU"
    ],
    "expect": [
      "1997-08-05T09:00",
      "1997-08-17T09:00",
      "1997-08-19T09:00",
      "1997-08-31T09:00"
    ],
    "gaps": [],
    "open": false,
    "rfcText": "==> (1997 EDT) August 5,17,19,31"
  },
  {
    "id": 39,
    "title": "An example where an invalid date (i.e., February 30) is ignored.",
    "dtstart": "2007-01-15T09:00",
    "exdate": [],
    "rrules": [
      "FREQ=MONTHLY;BYMONTHDAY=15,30;COUNT=5"
    ],
    "expect": [
      "2007-01-15T09:00",
      "2007-01-30T09:00",
      "2007-02-15T09:00",
      "2007-03-15T09:00",
      "2007-03-30T09:00"
    ],
    "gaps": [],
    "open": false,
    "rfcText": "==> (2007 EST) January 15,30\n(2007 EST) February 15\n(2007 EDT) March 15,30"
  }
]
