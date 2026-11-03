import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/kit";

/**
 * Paginação simples para qualquer lista.
 *
 * Uso:
 *   const pg = usePagination(lista, 10);
 *   pg.items.map(...)           // só os itens da página atual
 *   <Pager {...pg} />           // os botões embaixo da lista
 *
 * Quando a lista muda (filtro, busca, item novo), volta para a página 1.
 */
export function usePagination<T>(list: T[], pageSize = 10) {
  const [page, setPage] = useState(1);
  const total = list.length;
  const pages = Math.max(1, Math.ceil(total / pageSize));

  // volta para a primeira página quando muda a quantidade de itens
  useEffect(() => {
    setPage(1);
  }, [total]);

  const items = useMemo(
    () => list.slice((page - 1) * pageSize, page * pageSize),
    [list, page, pageSize],
  );

  return { items, page, pages, total, pageSize, setPage };
}

type PagerProps = {
  page: number;
  pages: number;
  total: number;
  pageSize: number;
  setPage: (p: number) => void;
};

export function Pager({ page, pages, total, pageSize, setPage }: PagerProps) {
  if (pages <= 1) return null;

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="mt-3 flex items-center justify-between gap-2 text-xs text-muted-foreground">
      <span>
        {from}–{to} de {total}
      </span>

      <div className="flex items-center gap-1">
        <Button
          size="icon"
          variant="ghost"
          disabled={page <= 1}
          onClick={() => setPage(page - 1)}
          aria-label="Página anterior"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>

        <span className="min-w-[3.5rem] text-center font-semibold text-foreground">
          {page} / {pages}
        </span>

        <Button
          size="icon"
          variant="ghost"
          disabled={page >= pages}
          onClick={() => setPage(page + 1)}
          aria-label="Próxima página"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
