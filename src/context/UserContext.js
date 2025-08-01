'use client';
import React, { createContext, useContext, useState, useEffect } from 'react';

const UserContext = createContext();

export function UserProvider({ children }) {
  const [user, setUser] = useState(undefined); // Fark: ilk değer undefined

  // User fetch; sadece ilk yüklemede
  useEffect(() => {
    // Sadece user hiç yoksa çek
    if (user === undefined) {
      fetch('/api/me')
        .then(res => res.ok ? res.json() : null)
        .then(data => {
          if (data && data.user_id) setUser(data);
          else setUser(null); // User yoksa null
        })
        .catch(() => setUser(null));
    }
  }, [user]);

  return (
    <UserContext.Provider value={{ user, setUser }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  return useContext(UserContext);
}

export default UserContext;
