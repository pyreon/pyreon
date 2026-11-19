// The Zero route for the chunked contract, as shown in the docs (the docs test checks the page shows this code).
// In an app this file is `src/routes/api/uploads/[...path].ts` and imports the handler from your own server code.
import { chunkedHandler } from './reference-chunked'

interface ApiContext {
  request: Request
}

const handle = ({ request }: ApiContext): Promise<Response> => chunkedHandler(request, '/api/uploads')

export const GET = handle
export const POST = handle
export const PUT = handle
export const DELETE = handle
