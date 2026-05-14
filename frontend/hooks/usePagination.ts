
import { useState, useMemo, useCallback } from 'react';

export function usePagination<T>(data: T[], initialItemsPerPage: number = 25) {
  const safeData = Array.isArray(data) ? data : [];
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(initialItemsPerPage);

  const maxPage = Math.ceil(safeData.length / itemsPerPage) || 1;

  // Reset to page 1 when data changes significantly
  useMemo(() => {
    if (currentPage > maxPage && maxPage > 0) {
      setCurrentPage(1);
    }
  }, [safeData.length, maxPage, currentPage]);

  const currentItems = useMemo(() => {
    const begin = (currentPage - 1) * itemsPerPage;
    const end = begin + itemsPerPage;
    return safeData.slice(begin, end);
  }, [safeData, currentPage, itemsPerPage]);

  const next = useCallback(() => {
    setCurrentPage((current) => Math.min(current + 1, maxPage));
  }, [maxPage]);

  const prev = useCallback(() => {
    setCurrentPage((current) => Math.max(current - 1, 1));
  }, []);

  const first = useCallback(() => {
    setCurrentPage(1);
  }, []);

  const last = useCallback(() => {
    setCurrentPage(maxPage);
  }, [maxPage]);

  const jump = useCallback((page: number) => {
    const pageNumber = Math.max(1, page);
    setCurrentPage(Math.min(pageNumber, maxPage));
  }, [maxPage]);

  const changeItemsPerPage = useCallback((count: number) => {
    setItemsPerPage(count);
    setCurrentPage(1); // Reset to first page when changing items per page
  }, []);

  return { 
    next, 
    prev, 
    first,
    last,
    jump, 
    currentItems, 
    currentPage, 
    maxPage, 
    totalItems: safeData.length,
    itemsPerPage,
    setItemsPerPage: changeItemsPerPage
  };
}
