import React from 'react'
import ReactDOM from 'react-dom/client'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import App from './App'
import { createQueryClient, persistOptions } from './lib/queryCache'
import './styles/globals.css'

// Create a React Query client with persistent caching
// Data persists to IndexedDB and survives page refreshes
const queryClient = createQueryClient()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={persistOptions}
      onSuccess={() => {
        // Cache restored from IndexedDB successfully
      }}
    >
      <App />
    </PersistQueryClientProvider>
  </React.StrictMode>
)
