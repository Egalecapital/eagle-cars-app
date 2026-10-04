import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import {
  type CarCatalog,
  fetchCarCatalog,
  getLastCarCatalog,
} from '@/services/car-service';
import type { Car } from '@/types/car';

export type CatalogStatus = 'loading' | 'ready' | 'error';

type CatalogState = { status: CatalogStatus; catalog?: CarCatalog };

/**
 * Danh mục xe đang cho thuê (Supabase + dữ liệu trình bày trong app).
 * Tải lại mỗi khi màn hình được mở. Khi chưa từng tải được → 'error'
 * (không tự coi xe nào là đang cho thuê).
 */
export function useCarCatalog() {
  const [state, setState] = useState<CatalogState>(() => {
    const last = getLastCarCatalog();

    return last ? { status: 'ready', catalog: last } : { status: 'loading' };
  });

  const load = useCallback(async (isActive: () => boolean) => {
    try {
      const catalog = await fetchCarCatalog();

      if (isActive()) setState({ status: 'ready', catalog });
    } catch {
      if (isActive()) {
        setState((current) => (current.catalog ? current : { status: 'error' }));
      }
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      load(() => active);

      return () => {
        active = false;
      };
    }, [load])
  );

  const reload = useCallback(() => {
    setState((current) => (current.catalog ? current : { status: 'loading' }));
    load(() => true);
  }, [load]);

  return {
    cars: state.catalog?.cars ?? [],
    status: state.status,
    /** true khi đang hiển thị bản cũ vì tải lại thất bại. */
    isStale: state.catalog?.source === 'cache',
    fetchedAt: state.catalog?.fetchedAt,
    reload,
  };
}

/** Một xe trong danh mục đang cho thuê (undefined nếu không có / đã tắt). */
export function useCatalogCar(id: string | undefined): ReturnType<typeof useCarCatalog> & {
  car: Car | undefined;
} {
  const catalog = useCarCatalog();

  return {
    ...catalog,
    car: id ? catalog.cars.find((car) => car.id === id) : undefined,
  };
}
