'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Fuse from 'fuse.js';

type Book = {
  no: number;
  title: string;
  url: string;
  author: string;
  authorUrl: string;
  thumb: string | null;
  date: string;
};

type ReadBook = Book & { yearMonth: string };

type BooksResponse = {
  books: Book[];
  total: number;
  page: number;
  hasMore: boolean;
};

type ReadBooksResponse = {
  books: ReadBook[];
  total: number;
  page: number;
  hasMore: boolean;
};

type Tab = 'wish' | 'read';

function BookList({
  apiPath,
  searchQuery,
}: {
  apiPath: string;
  searchQuery: string;
}) {
  const [bookList, setBookList] = useState<(Book | ReadBook)[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const isFetching = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchBooks = useCallback(
    async (pageNum: number) => {
      if (isFetching.current) return;
      isFetching.current = true;
      setLoading(true);
      const controller = new AbortController();
      abortControllerRef.current = controller;
      try {
        const res = await fetch(`${apiPath}?page=${pageNum}&limit=100`, {
          signal: controller.signal,
        });
        const data: BooksResponse | ReadBooksResponse = await res.json();
        setBookList((prev) => [...prev, ...data.books]);
        setHasMore(data.hasMore);
        setPage(pageNum + 1);
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
      } finally {
        setLoading(false);
        isFetching.current = false;
      }
    },
    [apiPath]
  );

  useEffect(() => {
    abortControllerRef.current?.abort();
    isFetching.current = false;
    setBookList([]);
    setPage(1);
    setHasMore(true);
  }, [apiPath]);

  useEffect(() => {
    if (page === 1 && bookList.length === 0 && hasMore) {
      fetchBooks(1);
    }
  }, [page, bookList.length, hasMore, fetchBooks]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && hasMore && !isFetching.current) {
        fetchBooks(page);
      }
    });

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, page, fetchBooks]);

  const fuse = useMemo(
    () => new Fuse(bookList, { keys: ['title', 'author'], threshold: 0.4 }),
    [bookList]
  );

  const displayedBooks = useMemo(() => {
    if (!searchQuery.trim()) return bookList;
    return fuse.search(searchQuery).map((result) => result.item);
  }, [fuse, searchQuery, bookList]);

  return (
    <>
      {displayedBooks.map((book) => (
        <div key={`${'yearMonth' in book ? book.yearMonth : 'wish'}-${book.no}`}>
          {'yearMonth' in book ? `[${book.yearMonth}] ` : ''}
          {book.no}.{' '}
          <a href={book.url} target="_blank" rel="noopener noreferrer">
            {book.title}
          </a>{' '}
          / {book.author}
        </div>
      ))}
      <div ref={sentinelRef} />
      {loading && <div>Loading...</div>}
      {!hasMore && !loading && <div>— END —</div>}
    </>
  );
}

export default function Home() {
  const [tab, setTab] = useState<Tab>('wish');
  const [searchQuery, setSearchQuery] = useState('');

  const tabStyle = (active: boolean) => ({
    padding: '0.3rem 0.8rem',
    marginRight: '0.5rem',
    background: active ? '#444' : '#111',
    color: '#fff',
    border: '1px solid #444',
    fontFamily: 'monospace',
    fontSize: '14px',
    cursor: 'pointer',
  });

  return (
    <>
      <div style={{ marginBottom: '0.5rem' }}>
        <button style={tabStyle(tab === 'wish')} onClick={() => setTab('wish')}>
          読みたい本
        </button>
        <button style={tabStyle(tab === 'read')} onClick={() => setTab('read')}>
          読んだ本
        </button>
      </div>
      <input
        type="search"
        placeholder="Search by title or author…"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        style={{
          display: 'block',
          width: '100%',
          marginBottom: '1rem',
          padding: '0.4rem 0.6rem',
          background: '#111',
          color: '#fff',
          border: '1px solid #444',
          fontFamily: 'monospace',
          fontSize: '14px',
        }}
      />
      {tab === 'wish' && (
        <BookList apiPath="/api/books" searchQuery={searchQuery} />
      )}
      {tab === 'read' && (
        <BookList apiPath="/api/read" searchQuery={searchQuery} />
      )}
    </>
  );
}
