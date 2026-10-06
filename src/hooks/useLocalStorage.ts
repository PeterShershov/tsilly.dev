import { useCallback, useEffect, useRef, useState } from "react";

export function useDebouncedLocalStorage<T>(
  key: string,
  initialValue: T,
  debounceMs: number = 1000
): [T, (value: T) => void, () => void] {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key);
      if (item) {
        return JSON.parse(item);
      }
    } catch (error) {
      console.warn(`Error reading localStorage key "${key}":`, error);
    }
    return initialValue;
  });
  const pendingValue = useRef<T | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        if (pendingValue.current !== null) {
          try {
            window.localStorage.setItem(key, JSON.stringify(pendingValue.current));
          } catch (error) {
            console.warn(`Error setting localStorage key "${key}":`, error);
          }
        }
      }
    };
  }, [key]);

  const setValue = useCallback(
    (value: T) => {
      setStoredValue(value);
      pendingValue.current = value;

      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      timeoutRef.current = setTimeout(() => {
        requestIdleCallback(
          () => {
            try {
              window.localStorage.setItem(key, JSON.stringify(value));
              pendingValue.current = null;
            } catch (error) {
              console.warn(`Error setting localStorage key "${key}":`, error);
            }
          },
          { timeout: 2000 }
        );
      }, debounceMs);
    },
    [key, debounceMs]
  );

  const flushNow = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (pendingValue.current !== null) {
      try {
        window.localStorage.setItem(key, JSON.stringify(pendingValue.current));
        pendingValue.current = null;
      } catch (error) {
        console.warn(`Error setting localStorage key "${key}":`, error);
      }
    }
  }, [key]);

  return [storedValue, setValue, flushNow];
}
