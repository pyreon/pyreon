import { defineAction } from '@pyreon/zero/actions'

// Defined OUTSIDE any page module: no route declares it, so with route
// middleware in the app the request gate cannot tell which gate applies and
// refuses it (403) instead of running it ungated.
export const shared = defineAction(async () => ({ ran: 'SHARED-RAN' }))
