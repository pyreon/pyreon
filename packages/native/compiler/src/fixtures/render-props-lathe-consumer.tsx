// A screen consuming @pyreon/lathe's generated data components from ANOTHER
// module (`render-props-lathe-books.tsx`, a verbatim copy of lathe's
// bookshelf output). PMTC resolves nothing across files, so these call sites
// lower from the shape of the render callback alone.
import { Stack, Text } from '@pyreon/primitives'
import { GetBookData, ListBooksData, type Book } from './render-props-lathe-books'

export function BookScreen(props: { bookId: string }) {
  return (
    <Stack>
      <GetBookData bookId={props.bookId}>
        {(book: Book | undefined) => <Text>{book?.title ?? 'Loading…'}</Text>}
      </GetBookData>
      <ListBooksData>
        {(books: Book[] | undefined) => <Text>{`${books?.length ?? 0} books`}</Text>}
      </ListBooksData>
    </Stack>
  )
}
