/* ============================================
   SpiceRoute - Analytics Page
   Charts and graphs for order volume,
   revenue, workload metrics, and performance
   ============================================ */
import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import API from '../../api/axios';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { FiGrid, FiMenu, FiBarChart2, FiLogOut, FiTrendingUp, FiDownload } from 'react-icons/fi';
import { MdRestaurantMenu } from 'react-icons/md';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

export default function Analytics() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [analytics, setAnalytics] = useState(null);
  const [period, setPeriod] = useState('today');
  const [loading, setLoading] = useState(true);
  const reportRef = useRef(null);

  useEffect(() => {
    const fetch = async () => {
      try { const { data } = await API.get(`/manager/analytics?period=${period}`); setAnalytics(data.analytics); }
      catch {
        setAnalytics({
          ordersByHour: { 9: 3, 10: 5, 11: 8, 12: 14, 13: 12, 14: 7, 15: 4, 16: 5, 17: 6, 18: 10, 19: 15, 20: 13, 21: 9, 22: 4 },
          categorySales: { Breakfast: 4200, 'Main Course': 5600, Beverages: 1800, Specials: 2400, Starters: 1900, Desserts: 800 },
          summary: { totalOrders: 47, totalRevenue: 12450, avgOrdersPerHour: 3.9, peakHour: '12' }
        });
      } finally { setLoading(false); }
    };
    fetch();
  }, [period]);

  const downloadPDF = async () => {
    if (!reportRef.current) return;
    const canvas = await html2canvas(reportRef.current, {
      backgroundColor: '#0d0a06',
      scale: 2,
    });
    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF('p', 'mm', 'a4');
    const imgProps = pdf.getImageProperties(imgData);
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
    pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
    pdf.save(`SpiceRoute_Analytics_${period}_${new Date().toLocaleDateString()}.pdf`);
  };

  if (loading) return <div className="loading-screen"><div className="spinner" /></div>;

  const hourData = Object.entries(analytics.ordersByHour).map(([h, v]) => ({ hour: `${h}:00`, orders: v }));
  const catData = Object.entries(analytics.categorySales).map(([name, value]) => ({ name, value }));
  const COLORS = ['#E8A317', '#F5C042', '#C4880E', '#22C55E', '#3B82F6', '#8B5CF6'];

  return (
    <div style={{ minHeight: '100vh' }} className="sidebar-layout">
      <div style={{ display: 'flex', minHeight: '100vh' }} className="sidebar-layout">
        {/* Sidebar */}
        <aside>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 32 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(232,163,23,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><MdRestaurantMenu size={20} color="#E8A317" /></div>
            <span style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 800, fontSize: '1rem' }}>SPICE<span style={{ color: '#E8A317' }}>ROUTE</span></span>
          </div>
          {[
            { icon: <FiGrid />, label: 'Dashboard', path: '/manager/dashboard' },
            { icon: <FiMenu />, label: 'Menu Management', path: '/manager/menu' },
            { icon: <FiBarChart2 />, label: 'Analytics', path: '/manager/analytics', active: true }
          ].map(item => (
            <Link key={item.path} to={item.path} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 10, marginBottom: 4, color: item.active ? '#E8A317' : '#A89B8C', background: item.active ? 'rgba(232,163,23,0.08)' : 'transparent', fontSize: '0.9rem', fontWeight: item.active ? 600 : 400, textDecoration: 'none' }}>
              {item.icon} <span className="hide-mobile">{item.label}</span>
            </Link>
          ))}
          <div style={{ flex: 1 }} className="hide-mobile" />
          <button onClick={() => { logout(); navigate('/'); }} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 10, background: 'none', border: 'none', color: '#6B5E50', cursor: 'pointer', fontSize: '0.9rem' }}>
            <FiLogOut /> <span className="hide-mobile">Logout</span>
          </button>
        </aside>

        {/* Content */}
        <main style={{ flex: 1, padding: 28, overflowY: 'auto' }} ref={reportRef}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }} className="stack-mobile">
            <div>
              <h1 style={{ fontFamily: "'Outfit', sans-serif", fontSize: '1.5rem', fontWeight: 800 }}>Analytics</h1>
              <p style={{ color: '#6B5E50', fontSize: '0.8rem' }}>Performance reports and revenue tracking</p>
            </div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }} className="stack-mobile">
              <div className="tabs">
                {['today', 'week', 'month'].map(p => (
                  <button key={p} className={`tab ${period === p ? 'active' : ''}`} onClick={() => setPeriod(p)}>{p.charAt(0).toUpperCase() + p.slice(1)}</button>
                ))}
              </div>
              <button onClick={downloadPDF} style={{ background: 'rgba(232,163,23,0.15)', border: '1px solid rgba(232,163,23,0.3)', borderRadius: 10, padding: '8px 16px', color: '#E8A317', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem', fontWeight: 600 }}>
                <FiDownload size={14} /> Export PDF
              </button>
            </div>
          </div>
          {/* Summary Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 16, marginBottom: 24 }}>
            {[
              { label: 'Total Orders', value: analytics.summary.totalOrders, icon: '📋' },
              { label: 'Total Revenue', value: `₹${analytics.summary.totalRevenue.toLocaleString()}`, icon: '💰' },
              { label: 'Avg Orders/Hr', value: analytics.summary.avgOrdersPerHour, icon: '📈' },
              { label: 'Peak Hour', value: `${analytics.summary.peakHour}:00`, icon: '🔥' }
            ].map((s, i) => (
              <div key={i} className="card" style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '1.5rem', marginBottom: 8 }}>{s.icon}</div>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, fontFamily: "'Outfit', sans-serif", color: '#E8A317' }}>{s.value}</div>
                <div style={{ fontSize: '0.78rem', color: '#6B5E50', marginTop: 4 }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Charts */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
            {/* Orders by Hour */}
            <div className="card">
              <h3 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}><FiTrendingUp size={16} color="#E8A317" /> Orders by Hour</h3>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={hourData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(232,163,23,0.08)" />
                  <XAxis dataKey="hour" stroke="#6B5E50" fontSize={11} />
                  <YAxis stroke="#6B5E50" fontSize={11} />
                  <Tooltip contentStyle={{ background: '#1a1208', border: '1px solid rgba(232,163,23,0.2)', borderRadius: 8, color: '#F5F0E8' }} />
                  <Bar dataKey="orders" fill="#E8A317" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Revenue by Category */}
            <div className="card">
              <h3 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: 16 }}>Revenue by Category</h3>
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie data={catData} cx="50%" cy="50%" outerRadius={window.innerWidth < 480 ? 70 : 90} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false} fontSize={10}>
                    {catData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: '#1a1208', border: '1px solid rgba(232,163,23,0.2)', borderRadius: 8, color: '#F5F0E8' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}