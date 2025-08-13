
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import AdminSessionCreation from './components/AdminSessionCreation';
import VirtualClassroom from './components/VirtualClassroom';
import './App.css';

function App() {
  return (
    <Router>
      <div className="App">
        <Routes>
          <Route path="/" element={<Navigate to="/admin/create-session" replace />} />
          <Route path="/admin/create-session" element={<AdminSessionCreation />} />
          <Route 
            path="/classroom/:sessionId" 
            element={<VirtualClassroom />} 
          />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
