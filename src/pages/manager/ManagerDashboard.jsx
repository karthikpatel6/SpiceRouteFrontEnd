/* ============================================
   SpiceRoute - Manager Dashboard (v2)
   - Mirror KDS tab (real-time order view)
   - Global Log (all order_instruction + kitchen_shout events)
   - workload_sync live gauge updates
   - inventory alerts
   - No static fallback data in production
   ============================================ */
import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import API from '../../api/axios';
import { FiActivity, FiUsers, FiDollarSign, FiClock, FiMenu, FiBarChart2, FiGrid, FiLogOut, FiMessageSquare, FiEye } from 'react-icons/fi';
import { MdRestaurantMenu } from 'react-icons/md';

export default function ManagerDashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { socket } = useSocket();
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [inventoryAlerts, setInventoryAlerts] = useState([]);
  const [activeView, setActiveView] = useState('dashboard'); // 'dashboard' | 'kds' | 'log'
  const [kdsOrders, setKdsOrders] = useState([]);
  const [globalLog, setGlobalLog] = useState([]);
  const logRef = useRef(null);

  // Fetch dashboard data
  useEffect(() => {
    const fetchDashboard = async () => {
      try {
        const { data } = await API.get('/manager/dashboard');
        setDashboard(data.dashboard);
      } catch {
        setDashboard({
          workload: { loadPercentage: 0, loadLevel: 'low', activeOrders: 0, kitchenCapacity: 15 },
          staffRecommendation: { onDutyStaff: 0, recommendedStaff: 2, needMoreStaff: false, message: 'Staff data unavailable.' },
          menuFilter: { isFiltering: false, lockedCount: 0, message: '' },
          todayStats: { totalOrders: 0, completedOrders: 0, activeOrders: 0, totalRevenue: 0, avgPrepTime: 0 },
          activeOrders: [],
          topItems: []
        });
      } finally { setLoading(false); }
    };
    fetchDashboard();
    const interval = setInterval(fetchDashboard, 15000);
    return () => clearInterval(interval);
  }, []);

  // Inventory alerts + KDS orders on mount
  useEffect(() => {
    if (!user?.restaurant) return;

    const fetchAlerts = async () => {
      try {
        const { data } = await API.get('/inventory/low-stock');
        setInventoryAlerts(data.ingredients.map(ing => ({ ingredientId: ing._id, name: ing.name, stock: ing.stock, threshold: ing.threshold })));
      } catch {}
    };

    const fetchKdsOrders = async () => {
      try {
        const { data } = await API.get(`/orders/kitchen/${user.restaurant}`);
        setKdsOrders(data.orders || []);
      } catch {}
    };

    fetchAlerts();
    fetchKdsOrders();
  }, [user]);

  // Socket: Manager room events
  useEffect(() => {
    if (!socket || !user?.restaurant) return;

    socket.emit('joinRestaurant', user.restaurant);
    socket.emit('joinManager', user.restaurant);

    const addLog = (entry) => {
      setGlobalLog(prev => [...prev.slice(-99), { ...entry, _logId: Date.now() + Math.random() }]);
      setTimeout(() => {
        if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
      }, 50);
    };

    // Live workload
    const handleWorkload = (data) => {
      if (data.restaurantId?.toString() === user.restaurant?.toString()) {
        setDashboard(prev => prev ? {
          ...prev,
          workload: { ...prev.workload, loadPercentage: data.loadPercentage, loadLevel: data.loadLevel, activeOrders: data.activeOrders }
        } : prev);
      }
    };

    // New order → add to Mirror KDS
    const handleNewOrder = (order) => {
      setKdsOrders(prev => {
        if (prev.find(o => o._id?.toString() === order.orderId?.toString())) return prev;
        return [{ _id: order.orderId, ...order, status: 'placed', minutesAgo: 0, items: order.items }, ...prev];
      });
      addLog({ type: 'new_order', label: `New order ${order.tokenNumber} at Table ${order.tableNumber}`, timestamp: new Date() });
    };

    // Status update → Mirror KDS
    const handleStatusUpdate = (data) => {
      setKdsOrders(prev => prev.map(o =>
        o._id?.toString() === data.orderId?.toString() ? { ...o, status: data.status } : o
      ));
    };

    // Customer instruction → Global Log
    const handleInstruction = (data) => {
      addLog({ type: 'instruction', label: `[${data.tokenNumber}] Customer: "${data.message}"`, timestamp: new Date() });
    };

    // Kitchen shout → Global Log
    const handleShout = (data) => {
      addLog({ type: 'shout', label: `[${data.tokenNumber}] Kitchen: "${data.message}"`, timestamp: new Date() });
    };

    // Manager alert → Global Log
    const handleAlert = (data) => {
      addLog({ type: 'alert', label: `🚨 Kitchen Alert: "${data.message}"`, timestamp: new Date() });
    };

    // Inventory alert
    const handleInventory = (alertData) => {
      setInventoryAlerts(prev => {
        const filtered = prev.filter(a => a.ingredientId !== alertData.ingredientId);
        return [...filtered, alertData];
      });
    };

    socket.on('workload_sync', handleWorkload);
    socket.on('newOrder', handleNewOrder);
    socket.on('update_status', handleStatusUpdate);
    socket.on('order_instruction', handleInstruction);
    socket.on('kitchen_shout', handleShout);
    socket.on('manager_alert', handleAlert);
    socket.on('inventory-alert', handleInventory);

    return () => {
      socket.off('workload_sync', handleWorkload);
      socket.off('newOrder', handleNewOrder);
      socket.off('update_status', handleStatusUpdate);
      socket.off('order_instruction', handleInstruction);
      socket.off('kitchen_shout', handleShout);
      socket.off('manager_alert', handleAlert);
      socket.off('inventory-alert', handleInventory);
    };
  }, [socket, user]);

  if (loading) return <div className="loading-screen"><div className="spinner" /></div>;
  const d = dashboard;
  const loadColor = d.workload.loadLevel === 'low' ? '#22C55E' : d.workload.loadLevel === 'moderate' ? '#E8A317' : '#EF4444';

  const navItems = [
    { icon: <FiGrid />, label: 'Dashboard', key: 'dashboard' },
    { icon: <FiEye />, label: 'Mirror KDS', key: 'kds' },
    { icon: <FiMessageSquare />, label: 'Global Log', key: 'log' },
    { icon: <FiMenu />, label: 'Menu Mgmt', path: '/manager/menu' },
    { icon: <FiBarChart2 />, label: 'Analytics', path: '/manager/analytics' },
    { icon: <FiActivity />, label: 'Intercom', path: '/manager/comms' }
  ];

  const statusColor = (s) => s === 'placed' ? '#22C55E' : s === 'preparing' ? '#E8A317' : '#6B5E50';

  return (
    <div style={{ minHeight: '100vh' }}>
      <div style={{ display: 'flex', minHeight: '100vh' }}>
        {/* Sidebar */}
        <aside style={{ width: 220, background: '#0d0a06', borderRight: '1px solid rgba(232,163,23,0.1)', padding: '20px 14px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 28 }}>
            <div style={{ width: 34, height: 34, borderRadius: 10, background: 'rgba(232,163,23,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <MdRestaurantMenu size={18} color="#E8A317" />
            </div>
            <span style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 800, fontSize: '0.95rem' }}>SPICE<span style={{ color: '#E8A317' }}>ROUTE</span></span>
          </div>
          {navItems.map(item => (
            item.path ? (
              <Link key={item.path} to={item.path} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 10, marginBottom: 4, color: '#A89B8C', background: 'transparent', fontSize: '0.88rem', textDecoration: 'none' }}>
                {item.icon} {item.label}
              </Link>
            ) : (
              <button key={item.key} onClick={() => setActiveView(item.key)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 10, marginBottom: 4, color: activeView === item.key ? '#E8A317' : '#A89B8C', background: activeView === item.key ? 'rgba(232,163,23,0.08)' : 'transparent', fontSize: '0.88rem', fontWeight: activeView === item.key ? 600 : 400, border: 'none', cursor: 'pointer', width: '100%', textAlign: 'left' }}>
                {item.icon} {item.label}
                {item.key === 'log' && globalLog.length > 0 && (
                  <span style={{ marginLeft: 'auto', background: '#EF4444', color: '#fff', fontSize: '0.65rem', fontWeight: 700, borderRadius: 10, padding: '1px 6px' }}>{Math.min(globalLog.length, 99)}</span>
                )}
              </button>
            )
          ))}
          <div style={{ flex: 1 }} />
          <button onClick={() => { logout(); navigate('/'); }} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 10, background: 'none', border: 'none', color: '#6B5E50', cursor: 'pointer', fontSize: '0.88rem' }}>
            <FiLogOut /> Logout
          </button>
        </aside>

        {/* Main Content */}
        <main style={{ flex: 1, padding: 24, overflowY: 'auto' }}>
          {/* DASHBOARD VIEW */}
          {activeView === 'dashboard' && (
            <>
              <div style={{ marginBottom: 20 }}>
                <h1 style={{ fontFamily: "'Outfit', sans-serif", fontSize: '1.4rem', fontWeight: 800 }}>Dashboard</h1>
                <p style={{ color: '#6B5E50', fontSize: '0.82rem' }}>Welcome back, {user?.name || 'Manager'}</p>
              </div>

              {/* Stats Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 14, marginBottom: 20 }}>
                {[
                  { icon: <FiActivity size={18} />, label: 'Kitchen Load', value: `${d.workload.loadPercentage}%`, color: loadColor, sub: d.workload.loadLevel.toUpperCase() },
                  { icon: <FiClock size={18} />, label: 'Active Orders', value: d.todayStats.activeOrders, color: '#E8A317', sub: `of ${d.todayStats.totalOrders} today` },
                  { icon: <FiDollarSign size={18} />, label: "Today's Revenue", value: `₹${d.todayStats.totalRevenue.toLocaleString()}`, color: '#22C55E', sub: `${d.todayStats.completedOrders} completed` },
                  { icon: <FiUsers size={18} />, label: 'Staff on Duty', value: d.staffRecommendation.onDutyStaff, color: d.staffRecommendation.needMoreStaff ? '#EF4444' : '#22C55E', sub: `Need ${d.staffRecommendation.recommendedStaff}` }
                ].map((stat, i) => (
                  <div key={i} className="card animate-fade" style={{ animationDelay: `${i * 0.1}s` }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                      <span style={{ color: '#6B5E50', fontSize: '0.78rem' }}>{stat.label}</span>
                      <div style={{ color: stat.color }}>{stat.icon}</div>
                    </div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 800, fontFamily: "'Outfit', sans-serif", color: stat.color }}>{stat.value}</div>
                    <div style={{ fontSize: '0.72rem', color: '#6B5E50', marginTop: 3 }}>{stat.sub}</div>
                  </div>
                ))}
              </div>

              {/* Workload + Staff */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 20 }}>
                <div className="card">
                  <h3 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: 14 }}>Kitchen Workload</h3>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
                    <div style={{ width: 110, height: 110, borderRadius: '50%', border: `5px solid ${loadColor}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', boxShadow: `0 0 24px ${loadColor}22` }}>
                      <span style={{ fontSize: '1.8rem', fontWeight: 800, fontFamily: "'Outfit', sans-serif", color: loadColor }}>{d.workload.loadPercentage}%</span>
                      <span style={{ fontSize: '0.65rem', color: '#6B5E50' }}>LOAD</span>
                    </div>
                  </div>
                  <div className="progress-bar"><div className="progress-fill" style={{ width: `${d.workload.loadPercentage}%` }} /></div>
                  <p style={{ fontSize: '0.78rem', color: '#A89B8C', marginTop: 8, textAlign: 'center' }}>
                    {d.workload.activeOrders} active / {d.workload.kitchenCapacity} capacity
                  </p>
                </div>

                <div className="card">
                  <h3 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: 14 }}>Staff Recommendation</h3>
                  <div style={{ background: d.staffRecommendation.needMoreStaff ? 'rgba(239,68,68,0.08)' : 'rgba(34,197,94,0.08)', border: `1px solid ${d.staffRecommendation.needMoreStaff ? 'rgba(239,68,68,0.2)' : 'rgba(34,197,94,0.2)'}`, borderRadius: 10, padding: 12, marginBottom: 12, fontSize: '0.82rem' }}>
                    {d.staffRecommendation.message}
                  </div>
                  <div style={{ fontSize: '0.82rem', color: '#A89B8C' }}>
                    <p style={{ marginBottom: 6 }}>Avg. Prep Time: <strong style={{ color: '#F5F0E8' }}>{d.todayStats.avgPrepTime} min</strong></p>
                    <p>Menu Filtering: <strong style={{ color: d.menuFilter.isFiltering ? '#EF4444' : '#22C55E' }}>{d.menuFilter.isFiltering ? `Active (${d.menuFilter.lockedCount} items locked)` : 'Inactive'}</strong></p>
                  </div>
                </div>
              </div>

              {/* Inventory Alerts */}
              {inventoryAlerts.length > 0 && (
                <div className="card" style={{ marginBottom: 20, border: '1px solid rgba(239,68,68,0.4)', background: 'rgba(239,68,68,0.05)' }}>
                  <h3 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: 14, color: '#f87171' }}>⚠️ Inventory Alerts</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {inventoryAlerts.map(alert => (
                      <div key={alert.ingredientId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#1a1208', padding: '9px 14px', borderRadius: 8 }}>
                        <div>
                          <strong style={{ display: 'block', color: '#f87171', fontSize: '0.88rem' }}>{alert.name} is running low</strong>
                          <span style={{ fontSize: '0.78rem', color: '#A89B8C' }}>Only <strong style={{color:'#f87171'}}>{alert.stock}</strong> left (Threshold: {alert.threshold})</span>
                        </div>
                        <button className="btn btn-sm" style={{ background: 'rgba(34,197,94,0.2)', color: '#4ade80', border: '1px solid rgba(34,197,94,0.3)' }} onClick={async () => {
                          try { await API.patch(`/inventory/${alert.ingredientId}/restock`); setInventoryAlerts(prev => prev.filter(a => a.ingredientId !== alert.ingredientId)); } catch {}
                        }}>Mark Restocked</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Top Items */}
              {d.topItems?.length > 0 && (
                <div className="card">
                  <h3 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: 14 }}>Top Selling Items</h3>
                  <table className="data-table">
                    <thead><tr><th>Item</th><th>Orders</th><th>Price</th></tr></thead>
                    <tbody>
                      {d.topItems.map((item, i) => (
                        <tr key={i}><td style={{ fontWeight: 500 }}>{item.name}</td><td><span className="badge badge-amber">{item.orderCount}</span></td><td>₹{item.price}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {/* MIRROR KDS VIEW */}
          {activeView === 'kds' && (
            <>
              <div style={{ marginBottom: 18 }}>
                <h1 style={{ fontFamily: "'Outfit', sans-serif", fontSize: '1.3rem', fontWeight: 800 }}>Mirror KDS</h1>
                <p style={{ color: '#6B5E50', fontSize: '0.82rem' }}>Real-time view of kitchen orders</p>
              </div>
              <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
                {kdsOrders.length === 0 ? (
                  <div style={{ color: '#6B5E50', textAlign: 'center', width: '100%', padding: 40 }}>
                    <p style={{ fontSize: '2rem' }}>🍳</p>
                    <p>No active kitchen orders</p>
                  </div>
                ) : kdsOrders.map((order) => (
                  <div key={order._id} className="order-card" style={{ minWidth: 260, maxWidth: 300 }}>
                    <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: '1.2rem', fontWeight: 800 }}>{order.tokenNumber}</div>
                    <div style={{ fontSize: '0.72rem', color: statusColor(order.status), marginBottom: 10 }}>
                      {order.status?.toUpperCase()} • T{order.tableNumber} • {order.minutesAgo || 0}M AGO
                    </div>
                    {order.items?.map((item, i) => (
                      <div key={i} style={{ fontSize: '0.85rem', padding: '4px 0', borderBottom: '1px solid rgba(232,163,23,0.05)' }}>
                        {item.quantity}x {item.name}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </>
          )}

          {/* GLOBAL LOG VIEW */}
          {activeView === 'log' && (
            <>
              <div style={{ marginBottom: 18 }}>
                <h1 style={{ fontFamily: "'Outfit', sans-serif", fontSize: '1.3rem', fontWeight: 800 }}>Global Log</h1>
                <p style={{ color: '#6B5E50', fontSize: '0.82rem' }}>All customer instructions, kitchen shouts, and alerts</p>
              </div>
              <div ref={logRef} style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 600, overflowY: 'auto' }}>
                {globalLog.length === 0 ? (
                  <div style={{ color: '#6B5E50', textAlign: 'center', padding: 40 }}>
                    <p>No events logged yet. Events will appear here in real-time.</p>
                  </div>
                ) : globalLog.map((entry) => (
                  <div key={entry._logId} style={{
                    display: 'flex', gap: 12, alignItems: 'flex-start',
                    padding: '10px 14px', borderRadius: 10,
                    background: entry.type === 'alert' ? 'rgba(239,68,68,0.08)' : entry.type === 'shout' ? 'rgba(232,163,23,0.08)' : 'rgba(34,197,94,0.06)',
                    border: `1px solid ${entry.type === 'alert' ? 'rgba(239,68,68,0.15)' : entry.type === 'shout' ? 'rgba(232,163,23,0.15)' : 'rgba(34,197,94,0.12)'}`
                  }}>
                    <span style={{ fontSize: '1rem' }}>{entry.type === 'alert' ? '🚨' : entry.type === 'shout' ? '📢' : entry.type === 'new_order' ? '🆕' : '💬'}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '0.85rem' }}>{entry.label}</div>
                      <div style={{ fontSize: '0.72rem', color: '#6B5E50', marginTop: 2 }}>{new Date(entry.timestamp).toLocaleTimeString()}</div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
