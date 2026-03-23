/* ============================================
   SpiceRoute - Menu Management Page
   Manager can view, toggle availability, and
   manage all menu items from this page
   ============================================ */
import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import API from '../../api/axios';
import { QRCodeSVG } from 'qrcode.react';
import { FiGrid, FiMenu, FiBarChart2, FiActivity, FiLogOut, FiPlus, FiEdit, FiTrash2 } from 'react-icons/fi';
import { MdRestaurantMenu } from 'react-icons/md';

export default function MenuManagement() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('All');
  const [showQR, setShowQR] = useState(false);

  // CRUD State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [formData, setFormData] = useState({
    name: '', price: '', category: 'Main Course', prepTime: 10, complexity: 'MEDIUM', isQuickPrep: false, isAvailable: true
  });

  const handleOpenModal = (item = null) => {
    if (item) {
      setEditItem(item);
      setFormData({
        name: item.name, price: item.price, category: item.category, prepTime: item.prepTime,
        complexity: item.complexity, isQuickPrep: item.isQuickPrep, isAvailable: item.isAvailable
      });
    } else {
      setEditItem(null);
      setFormData({
        name: '', price: '', category: 'Main Course', prepTime: 10, complexity: 'MEDIUM', isQuickPrep: false, isAvailable: true
      });
    }
    setIsModalOpen(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    try {
      if (editItem) {
        const { data } = await API.put(`/menu/${editItem._id}`, formData);
        setItems(prev => prev.map(i => i._id === editItem._id ? data.menuItem : i));
      } else {
        const { data } = await API.post('/menu', formData);
        setItems(prev => [...prev, data.menuItem]);
      }
      setIsModalOpen(false);
    } catch (err) {
      console.error(err);
      alert('Error saving menu item');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this item?')) return;
    try {
      await API.delete(`/menu/${id}`);
      setItems(prev => prev.filter(i => i._id !== id));
    } catch (err) {
      alert('Error deleting menu item');
    }
  };

  useEffect(() => {
    const fetch = async () => {
      try { const { data } = await API.get('/manager/menu'); setItems(data.menuItems); }
      catch {
        setItems([
          { _id: '1', name: 'Steamed Idli', category: 'Breakfast', price: 30, isAvailable: true, isQuickPrep: true, complexity: 'LOW', prepTime: 5, orderCount: 19 },
          { _id: '2', name: 'Masala Dosa', category: 'Breakfast', price: 60, isAvailable: true, isQuickPrep: false, complexity: 'MEDIUM', prepTime: 10, orderCount: 24 },
          { _id: '3', name: 'Paneer Butter Masala', category: 'Main Course', price: 160, isAvailable: true, isQuickPrep: false, complexity: 'MEDIUM', prepTime: 15, orderCount: 8 },
          { _id: '4', name: 'Maharaja Special Thali', category: 'Specials', price: 180, isAvailable: false, isQuickPrep: false, complexity: 'HIGH', prepTime: 30, orderCount: 5 },
          { _id: '5', name: 'Filter Coffee', category: 'Beverages', price: 20, isAvailable: true, isQuickPrep: true, complexity: 'LOW', prepTime: 3, orderCount: 38 },
          { _id: '6', name: 'Butter Chicken', category: 'Main Course', price: 200, isAvailable: true, isQuickPrep: false, complexity: 'HIGH', prepTime: 20, orderCount: 15 }
        ]);
      } finally { setLoading(false); }
    };
    fetch();
  }, []);

  const toggleAvailability = async (id) => {
    try { await API.patch(`/menu/${id}/toggle`); } catch {}
    setItems(prev => prev.map(i => i._id === id ? { ...i, isAvailable: !i.isAvailable } : i));
  };

  const categories = ['All', ...new Set(items.map(i => i.category))];
  const filtered = filter === 'All' ? items : items.filter(i => i.category === filter);

  if (loading) return <div className="loading-screen"><div className="spinner" /></div>;

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
            { icon: <FiMenu />, label: 'Menu Management', path: '/manager/menu', active: true },
            { icon: <FiBarChart2 />, label: 'Analytics', path: '/manager/analytics' },
            { icon: <FiActivity />, label: 'Kitchen View', path: '/kitchen/dashboard' }
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
        <main style={{ flex: 1, padding: 28 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }} className="stack-mobile">
            <h1 style={{ fontFamily: "'Outfit', sans-serif", fontSize: '1.5rem', fontWeight: 800 }}>Menu Management</h1>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowQR(true)}>Print QR</button>
              <button className="btn btn-primary btn-sm" onClick={() => handleOpenModal()}><FiPlus /> Add Item</button>
            </div>
          </div>

          {/* Category Filter */}
          <div className="tabs" style={{ marginBottom: 20 }}>
            {categories.map(cat => (
              <button key={cat} className={`tab ${filter === cat ? 'active' : ''}`} onClick={() => setFilter(cat)}>{cat}</button>
            ))}
          </div>

          {/* Menu Items Table */}
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div className="scroll-x">
              <table className="data-table">
                <thead><tr><th>Item</th><th>Category</th><th>Price</th><th>Prep Time</th><th>Complexity</th><th>Orders</th><th>Available</th><th>Actions</th></tr></thead>
                <tbody>
                  {filtered.map(item => (
                    <tr key={item._id}>
                      <td><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ fontWeight: 600 }}>{item.name}</span>{item.isQuickPrep && <span className="badge badge-green" style={{ fontSize: '0.6rem' }}>QP</span>}</div></td>
                      <td style={{ color: '#A89B8C' }}>{item.category}</td>
                      <td style={{ fontWeight: 600 }}>₹{item.price}</td>
                      <td style={{ color: '#A89B8C' }}>{item.prepTime}m</td>
                      <td><span className={`badge ${item.complexity === 'LOW' ? 'badge-green' : item.complexity === 'MEDIUM' ? 'badge-yellow' : 'badge-red'}`}>{item.complexity}</span></td>
                      <td><span className="badge badge-amber">{item.orderCount}</span></td>
                      <td>
                        <label className="toggle"><input type="checkbox" checked={item.isAvailable} onChange={() => toggleAvailability(item._id)} /><span className="toggle-slider" /></label>
                      </td>
                      <td><div style={{ display: 'flex', gap: 8 }}><button onClick={() => handleOpenModal(item)} style={{ background: 'none', border: 'none', color: '#A89B8C', cursor: 'pointer' }}><FiEdit size={15} /></button><button onClick={() => handleDelete(item._id)} style={{ background: 'none', border: 'none', color: '#EF4444', cursor: 'pointer' }}><FiTrash2 size={15} /></button></div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* QR Modal */}
          {showQR && (
            <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
              <div className="card" style={{ padding: 'clamp(20px, 5vw, 40px)', textAlign: 'center', background: '#1a1208', border: '1px solid #E8A317', maxWidth: '100%' }}>
                <h2 style={{ marginBottom: 20, fontSize: '1.2rem' }}>Customer Menu QR</h2>
                <div style={{ background: 'white', padding: 15, borderRadius: 10, display: 'inline-block' }}>
                  <QRCodeSVG value={`${window.location.origin}/menu/${user?.restaurant}?table=1`} size={window.innerWidth < 480 ? 160 : 200} />
                </div>
                <div style={{ marginTop: 24, display: 'flex', gap: 10, justifyContent: 'center' }} className="stack-mobile">
                  <button className="btn btn-secondary" onClick={() => window.print()} style={{ flex: 1 }}>Print</button>
                  <button className="btn btn-danger" onClick={() => setShowQR(false)} style={{ flex: 1 }}>Close</button>
                </div>
              </div>
            </div>
          )}

          {/* Item Form Modal */}
          {isModalOpen && (
            <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
              <div className="card" style={{ width: 400, maxWidth: '100%', background: '#1a1208', border: '1px solid #E8A317' }}>
                <h2 style={{ marginBottom: 20 }}>{editItem ? 'Edit Item' : 'Add New Item'}</h2>
                <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
                  <input required placeholder="Item Name" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} style={{ padding: 10, background: '#0d0a06', border: '1px solid #333', color: 'white', borderRadius: 4 }} />
                  <div style={{ display: 'flex', gap: 10 }}>
                    <input required type="number" placeholder="Price" value={formData.price} onChange={e => setFormData({...formData, price: Number(e.target.value)})} style={{ flex: 1, padding: 10, background: '#0d0a06', border: '1px solid #333', color: 'white', borderRadius: 4 }} />
                    <input required type="number" placeholder="Prep Time (m)" value={formData.prepTime} onChange={e => setFormData({...formData, prepTime: Number(e.target.value)})} style={{ flex: 1, padding: 10, background: '#0d0a06', border: '1px solid #333', color: 'white', borderRadius: 4 }} />
                  </div>
                  <select value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})} style={{ padding: 10, background: '#0d0a06', border: '1px solid #333', color: 'white', borderRadius: 4 }}>
                    <option>Breakfast</option><option>Main Course</option><option>Beverages</option><option>Desserts</option><option>Starters</option><option>Specials</option>
                  </select>
                  <select value={formData.complexity} onChange={e => setFormData({...formData, complexity: e.target.value})} style={{ padding: 10, background: '#0d0a06', border: '1px solid #333', color: 'white', borderRadius: 4 }}>
                    <option value="LOW">Low Complexity</option><option value="MEDIUM">Medium Complexity</option><option value="HIGH">High Complexity</option>
                  </select>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '0.9rem' }}>
                    <input type="checkbox" checked={formData.isQuickPrep} onChange={e => setFormData({...formData, isQuickPrep: e.target.checked})} /> Quick Prep Item
                  </label>
                  <div style={{ marginTop: 20, display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                    <button type="button" className="btn btn-secondary" onClick={() => setIsModalOpen(false)}>Cancel</button>
                    <button type="submit" className="btn btn-primary">Save Item</button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
