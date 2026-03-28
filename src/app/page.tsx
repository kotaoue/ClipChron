'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

type Book = {
  no: number;
  title: string;
  url: string;
  author: string;
  authorUrl: string;
  thumb: string | null;
  date: string;
};

type BooksResponse = {
  books: Book[];
  total: number;
  page: number;
  hasMore: boolean;
};

export default function Home() {
  const [bookList, setBookList] = useState<Book[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const isFetching = useRef(false);

  const fetchBooks = useCallback(async (pageNum: number) => {
    if (isFetching.current) return;
    isFetching.current = true;
    setLoading(true);
    try {
      const res = await fetch(`/api/books?page=${pageNum}&limit=100`);
      const data: BooksResponse = await res.json();
      setBookList((prev) => [...prev, ...data.books]);
      setHasMore(data.hasMore);
      setPage(pageNum + 1);
    } finally {
      setLoading(false);
      isFetching.current = false;
    }
  }, []);

  useEffect(() => {
    fetchBooks(1);
  }, [fetchBooks]);

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

  return (
    <>
      {bookList.map((book) => (
        <div key={book.no}>
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
