/* ============================================
   SpiceRoute - Staff Intercom Page
   Real-time Kitchen ↔ Manager chat channel.
   Fetches history from InternalComm collection.
   Sends messages via API (persisted) +
   Socket.IO (instant delivery).
   ============================================ */
import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import API from '../../api/axios';
import { FiSend, FiLogOut, FiGrid, FiMenu, FiBarChart2, FiActivity, FiMessageSquare } from 'react-icons/fi';
import { MdRestaurantMenu } from 'react-icons/md';

export default function StaffIntercom() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { socket } = useSocket();
  const [comms, setComms] = useState([]);
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const chatRef = useRef(null);

  // Fetch history
  useEffect(() => {
    if (!user?.restaurant) { setLoading(false); return; }
    const fetchComms = async () => {
      try {
        const { data } = await API.get(`/comms/${user.restaurant}`);
        setComms(data.comms || []);
      } catch { setComms([]); }
      finally { setLoading(false); }
    };
    fetchComms();
  }, [user]);

  // Scroll to bottom on new messages
  useEffect(() => {
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
  }, [comms]);

  // Socket listeners
  useEffect(() => {
    if (!socket || !user?.restaurant) return;

    socket.emit('joinManager', user.restaurant);

    const handleAlert = (data) => {
      setComms(prev => [...prev, {
        _id: Date.now(), senderName: data.senderName || 'Kitchen', role: 'kitchen',
        message: data.message, type: data.type || 'alert', timestamp: data.timestamp || new Date()
      }]);
    };

    const handleReply = (data) => {
      setComms(prev => [...prev, {
        _id: Date.now(), senderName: data.senderName || 'Manager', role: 'manager',
        message: data.message, type: 'reply', timestamp: data.timestamp || new Date()
      }]);
    };

    socket.on('manager_alert', handleAlert);
    socket.on('manager_reply', handleReply);

    return () => {
      socket.off('manager_alert', handleAlert);
      socket.off('manager_reply', handleReply);
    };
  }, [socket, user]);

  const sendMessage = async () => {
    if (!msg.trim() || sending) return;
    setSending(true);
    const role = user?.role || 'manager';
    const optimistic = {
      _id: 'opt_' + Date.now(),
      senderName: user?.name || role,
      role, message: msg.trim(),
      type: role === 'kitchen' ? 'shout' : 'reply',
      timestamp: new Date()
    };
    setComms(prev => [...prev, optimistic]);
    const sent = msg.trim();
    setMsg('');

    try {
      await API.post('/comms', {
        restaurantId: user.restaurant,
        senderName: user?.name || role,
        role,
        message: sent,
        type: role === 'kitchen' ? 'shout' : 'reply'
      });
    } catch {
      // Message already shown optimistically
    }
    setSending(false);
  };

  const bubbleColor = (role, type) => {
    if (role === 'kitchen') return { bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.15)', label: '#f87171' };
    if (role === 'manager') return { bg: 'rgba(232,163,23,0.08)', border: 'rgba(232,163,23,0.2)', label: '#E8A317' };
    return { bg: 'rgba(34,197,94,0.06)', border: 'rgba(34,197,94,0.12)', label: '#22C55E' };
  };

  if (loading) return <div className="loading-screen"><div className="spinner" /></div>;

  return (
    <div style={{ minHeight: '100vh' }} className="sidebar-layout">
      <div style={{ display: 'flex', minHeight: '100vh' }} className="sidebar-layout">
        {/* Sidebar */}
        <aside>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 28 }}>
            <div style={{ width: 34, height: 34, borderRadius: 10, background: 'rgba(232,163,23,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <MdRestaurantMenu size={18} color="#E8A317" />
            </div>
            <span style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 800, fontSize: '0.95rem' }}>SPICE<span style={{ color: '#E8A317' }}>ROUTE</span></span>
          </div>
          {[
            { icon: <FiGrid />, label: 'Dashboard', path: '/manager/dashboard' },
            { icon: <FiMenu />, label: 'Menu Mgmt', path: '/manager/menu' },
            { icon: <FiBarChart2 />, label: 'Analytics', path: '/manager/analytics' },
            { icon: <FiActivity />, label: 'Kitchen View', path: '/kitchen/dashboard' },
            { icon: <FiMessageSquare />, label: 'Intercom', path: '/manager/comms', active: true }
          ].map(item => (
            <Link key={item.path} to={item.path} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 10, marginBottom: 4, color: item.active ? '#E8A317' : '#A89B8C', background: item.active ? 'rgba(232,163,23,0.08)' : 'transparent', fontSize: '0.88rem', fontWeight: item.active ? 600 : 400, textDecoration: 'none' }}>
              {item.icon} <span className="hide-mobile">{item.label}</span>
            </Link>
          ))}
          <div style={{ flex: 1 }} className="hide-mobile" />
          <button onClick={() => { logout(); navigate('/'); }}
            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 10, background: 'none', border: 'none', color: '#6B5E50', cursor: 'pointer', fontSize: '0.88rem' }}>
            <FiLogOut /> <span className="hide-mobile">Logout</span>
          </button>
        </aside>

        {/* Chat Area */}
        <main style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 0 }}>
          {/* Header */}
          <div style={{ padding: '20px 24px', borderBottom: '1px solid rgba(232,163,23,0.08)' }}>
            <h1 style={{ fontFamily: "'Outfit', sans-serif", fontSize: '1.3rem', fontWeight: 800 }}>Staff Intercom</h1>
            <p style={{ color: '#6B5E50', fontSize: '0.8rem' }}>Real-time Kitchen ↔ Manager communication.</p>
          </div>

          {/* Messages */}
          <div ref={chatRef} style={{ flex: 1, padding: '20px 24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {comms.length === 0 ? (
              <div style={{ textAlign: 'center', color: '#6B5E50', padding: 40 }}>
                <p style={{ fontSize: '2rem' }}>📡</p>
                <p>No messages yet.</p>
              </div>
            ) : comms.map((c) => {
              const colors = bubbleColor(c.role, c.type);
              const isMe = c.role === (user?.role || 'manager');
              return (
                <div key={c._id} style={{ display: 'flex', flexDirection: 'column', alignItems: isMe ? 'flex-end' : 'flex-start' }}>
                  <div style={{
                    maxWidth: '85%', padding: '10px 14px', borderRadius: 12,
                    background: colors.bg, border: `1px solid ${colors.border}`
                  }}>
                    <div style={{ fontSize: '0.7rem', color: colors.label, marginBottom: 4, fontWeight: 600 }}>
                      {c.role === 'kitchen' ? '👨‍🍳' : '👔'} {c.senderName}
                      {c.type === 'alert' && <span style={{ marginLeft: 6, background: 'rgba(239,68,68,0.15)', color: '#f87171', borderRadius: 4, padding: '1px 5px', fontSize: '0.65rem' }}>ALERT</span>}
                    </div>
                    <div style={{ fontSize: '0.88rem' }}>{c.message}</div>
                  </div>
                  <div style={{ fontSize: '0.68rem', color: '#6B5E50', marginTop: 2 }}>
                    {new Date(c.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Input Bar */}
          <div style={{ padding: '14px 24px', borderTop: '1px solid rgba(232,163,23,0.08)', display: 'flex', gap: 10 }}>
            <input
              value={msg}
              onChange={e => setMsg(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
              placeholder="Message..."
              style={{
                flex: 1, background: '#1a1208', border: '1px solid rgba(232,163,23,0.15)',
                borderRadius: 10, padding: '10px 14px', color: '#F5F0E8', fontSize: '0.88rem', outline: 'none'
              }}
            />
            <button onClick={sendMessage} disabled={!msg.trim() || sending}
              style={{
                background: 'rgba(232,163,23,0.15)', border: '1px solid rgba(232,163,23,0.3)',
                borderRadius: 10, padding: '10px 16px', cursor: 'pointer', color: '#E8A317',
                opacity: !msg.trim() || sending ? 0.5 : 1, display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, fontSize: '0.85rem'
              }}>
              <FiSend size={16} /> <span className="hide-mobile">Send</span>
            </button>
          </div>
        </main>
      </div>
    </div>
  );
}
