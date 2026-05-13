import { ThemeProvider } from "@/components/theme-provider"
import { AppContent } from "@/components/app-content"

function App() {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  )
}

export default App
