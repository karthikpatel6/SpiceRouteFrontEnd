/* ============================================
   SpiceRoute - Kitchen Display System (v2)
   Fully socket-driven: no polling, no demo data.
   - newOrder: instant card injection
   - update_status: live card update
   - order_instruction: customer notes on cards
   - manager_reply: incoming manager messages
   - Send Shout to customer
   - Flag Resource Stress to manager
   ============================================ */
import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import API from '../../api/axios';
import { FiSearch, FiBell, FiSettings, FiUser, FiClock, FiPrinter, FiSend, FiAlertTriangle } from 'react-icons/fi';
import { MdRestaurantMenu, MdPause } from 'react-icons/md';

export default function KitchenDashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { socket } = useSocket();
  const [orders, setOrders] = useState([]);
  const [stats, setStats] = useState({ total: 0, new: 0, inPrep: 0, late: 0 });
  const [activeTab, setActiveTab] = useState('all');
  const [loading, setLoading] = useState(true);
  const [clock, setClock] = useState(new Date());
  const [shoutModal, setShoutModal] = useState(null); // { orderId, tokenNumber }
  const [shoutMsg, setShoutMsg] = useState('');
  const [managerMsg, setManagerMsg] = useState('');
  const [managerAlertMsg, setManagerAlertMsg] = useState('');
  const [managerNotif, setManagerNotif] = useState(null);
  const notifTimeout = useRef(null);

  // Clock
  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Initial fetch
  useEffect(() => {
    const fetchOrders = async () => {
      try {
        const restaurantId = user?.restaurant;
        if (!restaurantId) { setLoading(false); return; }
        const { data } = await API.get(`/orders/kitchen/${restaurantId}`);
        setOrders(data.orders || []);
        setStats(data.stats || { total: 0, new: 0, inPrep: 0, late: 0 });
      } catch (err) {
        console.error('Kitchen orders fetch error:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchOrders();
  }, [user]);

  // Socket event listeners
  useEffect(() => {
    if (!socket || !user?.restaurant) return;

    socket.emit('joinKitchen', user.restaurant);
    socket.emit('joinRestaurant', user.restaurant);

    // New order injected into the board
    const handleNewOrder = (order) => {
      setOrders(prev => {
        // Avoid duplicates
        if (prev.find(o => o._id?.toString() === order.orderId?.toString())) return prev;
        const newOrder = {
          _id: order.orderId,
          tokenNumber: order.tokenNumber,
          tableNumber: order.tableNumber,
          orderType: order.orderType,
          status: 'placed',
          minutesAgo: 0,
          priority: 'normal',
          items: order.items,
          specialInstructions: order.specialInstructions,
          thread: order.specialInstructions
            ? [{ sender: 'Customer', role: 'customer', message: order.specialInstructions }]
            : [],
          isLate: false
        };
        return [newOrder, ...prev];
      });
      setStats(prev => ({ ...prev, total: prev.total + 1, new: prev.new + 1 }));
    };

    // Status update from other kitchen staff
    const handleStatusUpdate = (data) => {
      setOrders(prev => prev.map(o =>
        o._id?.toString() === data.orderId?.toString()
          ? { ...o, status: data.status, kitchenProgress: data.kitchenProgress }
          : o
      ));
    };

    // Customer sends an instruction
    const handleInstruction = (data) => {
      setOrders(prev => prev.map(o =>
        o._id?.toString() === data.orderId?.toString()
          ? { ...o, thread: [...(o.thread || []), { sender: 'Customer', role: 'customer', message: data.message, timestamp: data.timestamp }] }
          : o
      ));
    };

    // Manager reply
    const handleManagerReply = (data) => {
      setManagerNotif(data.message);
      clearTimeout(notifTimeout.current);
      notifTimeout.current = setTimeout(() => setManagerNotif(null), 6000);
    };

    socket.on('newOrder', handleNewOrder);
    socket.on('update_status', handleStatusUpdate);
    socket.on('order_instruction', handleInstruction);
    socket.on('manager_reply', handleManagerReply);

    return () => {
      socket.off('newOrder', handleNewOrder);
      socket.off('update_status', handleStatusUpdate);
      socket.off('order_instruction', handleInstruction);
      socket.off('manager_reply', handleManagerReply);
    };
  }, [socket, user]);

  // Update order status via API
  const updateStatus = async (orderId, status) => {
    try {
      await API.patch(`/orders/${orderId}/status`, { status });
      setOrders(prev => prev.map(o => o._id === orderId ? { ...o, status } : o));
    } catch {
      setOrders(prev => prev.map(o => o._id === orderId ? { ...o, status } : o));
    }
  };

  // Send kitchen shout to customer
  const sendShout = async () => {
    if (!shoutMsg.trim() || !shoutModal) return;
    try {
      if (shoutModal.orderId && shoutModal.orderId !== 'demo') {
        await API.post(`/orders/${shoutModal.orderId}/shout`, {
          message: shoutMsg, senderName: user?.name || 'Kitchen'
        });
      } else if (socket) {
        socket.emit('kitchen_shout', {
          restaurantId: user.restaurant,
          tokenNumber: shoutModal.tokenNumber,
          orderId: shoutModal.orderId,
          message: shoutMsg,
          senderName: user?.name || 'Kitchen'
        });
      }
    } catch {
      if (socket) {
        socket.emit('kitchen_shout', {
          restaurantId: user.restaurant,
          tokenNumber: shoutModal.tokenNumber,
          orderId: shoutModal.orderId,
          message: shoutMsg,
          senderName: user?.name || 'Kitchen'
        });
      }
    }
    setShoutMsg('');
    setShoutModal(null);
  };

  // Send manager alert
  const sendManagerAlert = async () => {
    if (!managerAlertMsg.trim()) return;
    try {
      await API.post('/comms', {
        restaurantId: user.restaurant,
        senderName: user?.name || 'Kitchen',
        role: 'kitchen',
        message: managerAlertMsg,
        type: 'alert'
      });
    } catch {
      if (socket) {
        socket.emit('manager_alert', {
          restaurantId: user.restaurant,
          message: managerAlertMsg,
          senderName: user?.name || 'Kitchen',
          type: 'alert'
        });
      }
    }
    setManagerAlertMsg('');
    setManagerMsg('');
  };

  const filteredOrders = activeTab === 'all' ? orders
    : activeTab === 'new' ? orders.filter(o => o.status === 'placed')
    : activeTab === 'inPrep' ? orders.filter(o => o.status === 'preparing')
    : orders.filter(o => o.isLate);

  const clockStr = clock.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  const priorityBadge = (p) => p === 'rush' ? { bg: '#EF4444', text: 'RUSH' } : p === 'priority' ? { bg: '#E8A317', text: 'Priority' } : null;
  const statusColor = (s) => s === 'placed' ? '#22C55E' : s === 'preparing' ? '#E8A317' : '#6B5E50';
  const statusLabel = (s, late) => late ? 'LATE' : s === 'placed' ? 'NEW ORDER' : s === 'preparing' ? 'IN PREP' : s.toUpperCase();

  if (loading) return <div className="loading-screen"><div className="spinner" /></div>;

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Manager reply notification */}
      {managerNotif && (
        <div style={{
          position: 'fixed', top: 14, left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(232,163,23,0.12)', border: '1px solid rgba(232,163,23,0.3)',
          borderRadius: 12, padding: '12px 20px', zIndex: 9999,
          color: '#F5F0E8', fontSize: '0.88rem', maxWidth: 340
        }}>
          👔 <strong>Manager:</strong> {managerNotif}
        </div>
      )}

      {/* Shout Modal */}
      {shoutModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#1a1208', border: '1px solid rgba(232,163,23,0.2)', borderRadius: 16, padding: 24, width: 320 }}>
            <h3 style={{ fontWeight: 700, marginBottom: 8 }}>📢 Send Shout to Customer</h3>
            <p style={{ color: '#A89B8C', fontSize: '0.82rem', marginBottom: 16 }}>Order: {shoutModal.tokenNumber}</p>
            <input
              value={shoutMsg}
              onChange={e => setShoutMsg(e.target.value)}
              placeholder="e.g. Sorry, 5 mins delay due to rush"
              style={{ width: '100%', background: '#0d0a06', border: '1px solid rgba(232,163,23,0.15)', borderRadius: 8, padding: '10px 12px', color: '#F5F0E8', fontSize: '0.88rem', marginBottom: 12, boxSizing: 'border-box', outline: 'none' }}
            />
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setShoutModal(null)} style={{ flex: 1, padding: 10, background: '#333', border: 'none', borderRadius: 8, color: '#A89B8C', cursor: 'pointer' }}>Cancel</button>
              <button onClick={sendShout} style={{ flex: 1, padding: 10, background: 'rgba(232,163,23,0.15)', border: '1px solid rgba(232,163,23,0.3)', borderRadius: 8, color: '#E8A317', cursor: 'pointer', fontWeight: 600 }}>Send</button>
            </div>
          </div>
        </div>
      )}

      {/* KDS Header */}
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 24px', borderBottom: '1px solid rgba(232,163,23,0.12)', background: '#0d0a06' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(232,163,23,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <MdRestaurantMenu size={18} color="#E8A317" />
          </div>
          <div><div style={{ fontWeight: 700, fontSize: '0.95rem' }}>KDS Active Orders</div><div style={{ fontSize: '0.7rem', color: '#6B5E50' }}>STATION 1: MAIN KITCHEN</div></div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ background: '#1a1208', border: '1px solid rgba(232,163,23,0.15)', borderRadius: 20, padding: '6px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <FiClock size={14} color="#E8A317" /><span style={{ fontFamily: 'monospace', fontWeight: 600, fontSize: '0.9rem', color: '#E8A317' }}>{clockStr}</span>
          </div>
          <FiSearch size={18} color="#A89B8C" style={{ cursor: 'pointer' }} />
          <FiBell size={18} color="#A89B8C" style={{ cursor: 'pointer' }} />
          <button onClick={() => { logout(); navigate('/'); }} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><FiUser size={18} color="#A89B8C" /></button>
        </div>
      </header>

      {/* Manager Alert Bar */}
      <div style={{ padding: '10px 24px', borderBottom: '1px solid rgba(232,163,23,0.06)', display: 'flex', gap: 10 }}>
        <input
          value={managerAlertMsg}
          onChange={e => setManagerAlertMsg(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && sendManagerAlert()}
          placeholder="🚨 Flag Resource Stress or message manager..."
          style={{ flex: 1, background: '#1a1208', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: '7px 12px', color: '#F5F0E8', fontSize: '0.82rem', outline: 'none' }}
        />
        <button onClick={sendManagerAlert} style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '7px 14px', color: '#f87171', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem' }}>
          <FiAlertTriangle size={14} /> Alert
        </button>
      </div>

      {/* Tabs */}
      <div style={{ padding: '12px 24px', borderBottom: '1px solid rgba(232,163,23,0.06)' }}>
        <div className="tabs">
          {[
            { key: 'all', label: 'All Orders', count: stats.total },
            { key: 'new', label: 'New', count: stats.new },
            { key: 'inPrep', label: 'In Prep', count: stats.inPrep },
            { key: 'late', label: 'Expedite', count: stats.late }
          ].map(tab => (
            <button key={tab.key} className={`tab ${activeTab === tab.key ? 'active' : ''}`} onClick={() => setActiveTab(tab.key)}>
              {tab.label}<span className="count">{tab.count}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Order Cards Grid */}
      <div style={{ flex: 1, padding: 24, overflowX: 'auto', display: 'flex', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        {filteredOrders.length === 0 ? (
          <div style={{ textAlign: 'center', width: '100%', padding: 60, color: '#6B5E50' }}>
            <p style={{ fontSize: '3rem' }}>🍳</p>
            <p>No active orders. Waiting for new orders...</p>
          </div>
        ) : filteredOrders.map((order, idx) => {
          const badge = priorityBadge(order.priority);
          return (
            <div key={order._id} className={`order-card ${order.priority === 'rush' ? 'rush' : ''} ${order.priority === 'priority' ? 'priority' : ''} ${order.isLate ? 'late' : ''}`}
              style={{ minWidth: 280, maxWidth: 320, animation: `fadeIn 0.4s ease ${idx * 0.1}s both` }}>
              {/* Card Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                <div>
                  <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: '1.3rem', fontWeight: 800 }}>{order.tokenNumber}</div>
                  <div style={{ fontSize: '0.72rem', fontWeight: 600, color: statusColor(order.status), letterSpacing: 0.5 }}>
                    {statusLabel(order.status, order.isLate)} • T{order.tableNumber} • {order.minutesAgo}M AGO
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  {badge && <span style={{ padding: '3px 10px', borderRadius: 6, fontSize: '0.65rem', fontWeight: 700, background: badge.bg + '22', color: badge.bg, border: `1px solid ${badge.bg}44` }}>{badge.text}</span>}
                  <span style={{ padding: '3px 10px', borderRadius: 6, fontSize: '0.65rem', fontWeight: 500, background: '#1a1208', color: '#A89B8C', border: '1px solid rgba(232,163,23,0.08)' }}>{order.orderType}</span>
                </div>
              </div>

              {/* Items */}
              <div style={{ marginBottom: 12 }}>
                {order.items.map((item, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: i < order.items.length - 1 ? '1px solid rgba(232,163,23,0.05)' : 'none' }}>
                    <span style={{ fontSize: '0.88rem' }}>{item.quantity}x {item.name}</span>
                    {item.station && <span style={{ fontSize: '0.7rem', color: '#6B5E50' }}>{item.station}</span>}
                  </div>
                ))}
              </div>

              {/* Customer Thread Messages */}
              {order.thread && order.thread.length > 0 && (
                <div style={{ marginBottom: 12, padding: '8px 10px', background: 'rgba(232,163,23,0.06)', borderRadius: 8, borderLeft: '2px solid rgba(232,163,23,0.3)' }}>
                  {order.thread.filter(t => t.role === 'customer').map((t, i) => (
                    <div key={i} style={{ fontSize: '0.78rem', color: '#E8A317', marginBottom: i < order.thread.length - 1 ? 4 : 0 }}>
                      💬 {t.message}
                    </div>
                  ))}
                </div>
              )}

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button className={`btn btn-sm ${order.status === 'placed' ? 'btn-secondary' : ''}`}
                  style={order.status !== 'placed' ? { background: '#333', color: '#888', border: '1px solid #444', cursor: 'default' } : {}}
                  onClick={() => order.status === 'placed' && updateStatus(order._id, 'preparing')}>
                  {order.status === 'placed' ? 'FIRE' : 'FIRED'}
                </button>
                <button className={`btn btn-sm ${order.status === 'preparing' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => order.status === 'preparing' && updateStatus(order._id, 'ready')}>
                  PLATED
                </button>
                <button onClick={() => setShoutModal({ orderId: order._id, tokenNumber: order.tokenNumber })}
                  style={{ padding: '4px 10px', background: 'rgba(232,163,23,0.08)', border: '1px solid rgba(232,163,23,0.15)', borderRadius: 6, color: '#E8A317', cursor: 'pointer', fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <FiSend size={11} /> Shout
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Bottom Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 24px', borderTop: '1px solid rgba(232,163,23,0.12)', background: '#0d0a06' }}>
        <div style={{ display: 'flex', gap: 12 }}>
          <button className="btn btn-sm btn-secondary"><FiPrinter size={14}/> Re-print All</button>
          <button className="btn btn-sm btn-secondary"><MdPause size={14}/> Pause Station</button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ fontSize: '0.75rem', color: '#6B5E50' }}>ACTIVE STATION</div>
          <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '0.85rem', color: '#E8A317' }}>KITCHEN_ALPHA_01</span>
          <button className="btn btn-sm btn-danger" onClick={() => orders.forEach(o => o.status === 'preparing' && updateStatus(o._id, 'ready'))}>
            BUMP ALL COMPLETED
          </button>
        </div>
      </div>
    </div>
  );
}
