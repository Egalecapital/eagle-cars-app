import { useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase';
import { type AccountState, getAccountState } from '@/services/account-service';

/** Trạng thái tài khoản hiện tại; tự cập nhật khi đăng nhập / đăng xuất. */
export function useAccount() {
  const [account, setAccount] = useState<AccountState | undefined>();

  useEffect(() => {
    let active = true;

    const refresh = () => {
      getAccountState().then((state) => {
        if (active) setAccount(state);
      });
    };

    refresh();

    const { data } = supabase.auth.onAuthStateChange(() => {
      // Không gọi API Supabase trực tiếp trong callback (khuyến nghị của supabase-js).
      setTimeout(refresh, 0);
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  return { account, loading: account === undefined };
}
