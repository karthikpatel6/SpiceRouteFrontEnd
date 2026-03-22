/* ============================================
   SpiceRoute - Order Tracking Page (v2)
   Live order status with bidirectional chat
   (OrderThread). Listens for kitchen_shout
   via socket and shows toast notifications.
   Persists thread from DB on refresh.
   ============================================ */
import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useSocket } from '../../context/SocketContext';
import API from '../../api/axios';
import { FiArrowLeft, FiMoreVertical, FiCheckCircle, FiClock, FiSend } from 'react-icons/fi';
import { MdRestaurantMenu } from 'react-icons/md';

/* ---- OrderThread Component ---- */
function OrderThread({ order, onSendInstruction }) {
  const [msg, setMsg] = useState('');
  const [sending, setSending] = useState(false);
  const threadRef = useRef(null);

  useEffect(() => {
    if (threadRef.current) {
      threadRef.current.scrollTop = threadRef.current.scrollHeight;
    }
  }, [order?.thread]);

  const handleSend = async () => {
    if (!msg.trim()) return;
    setSending(true);
    await onSendInstruction(msg.trim());
    setMsg('');
    setSending(false);
  };

  if (!order) return null;

  return (
    <div style={{ padding: '0 16px', marginBottom: 20 }}>
      <div style={{ background: '#1a1208', border: '1px solid rgba(232,163,23,0.08)', borderRadius: 14, padding: 16 }}>
        <h3 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: 12 }}>💬 Order Thread</h3>

        {/* Thread messages */}
        <div ref={threadRef} style={{ maxHeight: 200, overflowY: 'auto', marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {(!order.thread || order.thread.length === 0) ? (
            <p style={{ fontSize: '0.8rem', color: '#6B5E50', textAlign: 'center' }}>
              Send a note to the kitchen (e.g. "Extra spicy please")
            </p>
          ) : order.thread.map((msg, i) => (
            <div key={i} style={{
              alignSelf: msg.role === 'customer' ? 'flex-end' : 'flex-start',
              background: msg.role === 'customer' ? 'rgba(232,163,23,0.12)' : 'rgba(34,197,94,0.08)',
              border: `1px solid ${msg.role === 'customer' ? 'rgba(232,163,23,0.2)' : 'rgba(34,197,94,0.2)'}`,
              borderRadius: 10, padding: '8px 12px', maxWidth: '80%'
            }}>
              <div style={{ fontSize: '0.7rem', color: '#6B5E50', marginBottom: 2 }}>
                {msg.role === 'customer' ? '👤 You' : `👨‍🍳 ${msg.sender || 'Kitchen'}`}
              </div>
              <div style={{ fontSize: '0.85rem' }}>{msg.message}</div>
            </div>
          ))}
        </div>

        {/* Input */}
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={msg}
            onChange={e => setMsg(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
            placeholder="Send a note to the kitchen..."
            style={{
              flex: 1, background: '#0d0a06', border: '1px solid rgba(232,163,23,0.15)',
              borderRadius: 8, padding: '8px 12px', color: '#F5F0E8', fontSize: '0.85rem',
              outline: 'none'
            }}
          />
          <button
            onClick={handleSend}
            disabled={sending || !msg.trim()}
            style={{
              background: 'rgba(232,163,23,0.15)', border: '1px solid rgba(232,163,23,0.3)',
              borderRadius: 8, padding: '8px 12px', cursor: 'pointer', color: '#E8A317',
              opacity: sending || !msg.trim() ? 0.5 : 1
            }}>
            <FiSend size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---- Main OrderTracking Component ---- */
export default function OrderTracking() {
  const { tokenNumber } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { socket } = useSocket();
  const [order, setOrder] = useState(location.state?.order || null);
  const [loading, setLoading] = useState(!location.state?.order);
  const [shoutToast, setShoutToast] = useState(null);
  const toastTimeout = useRef(null);

  const fetchOrder = async () => {
    try {
      const { data } = await API.get(`/orders/track/${encodeURIComponent(tokenNumber)}`);
      setOrder(data.order);
    } catch {
      if (!order) {
        // Only set fallback if we have no order at all
        setOrder({
          tokenNumber: decodeURIComponent(tokenNumber),
          status: 'placed', kitchenProgress: 0,
          kitchenNote: 'Order received, waiting for kitchen confirmation',
          estimatedWaitTime: 15,
          placedAt: new Date().toISOString(),
          items: location.state?.order?.items || [],
          subtotal: location.state?.order?.subtotal || 0,
          tax: location.state?.order?.tax || 0,
          total: location.state?.order?.total || 0,
          thread: []
        });
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrder();
    const interval = setInterval(fetchOrder, 5000);
    return () => clearInterval(interval);
  }, [tokenNumber]);

  // Socket: join order room and listen for live updates
  useEffect(() => {
    if (!socket || !tokenNumber) return;

    const decoded = decodeURIComponent(tokenNumber);
    socket.emit('trackOrder', decoded);

    const handleStatusUpdate = (data) => {
      if (data.tokenNumber === decoded) {
        setOrder(prev => prev ? {
          ...prev,
          status: data.status,
          kitchenProgress: data.kitchenProgress,
          kitchenNote: data.kitchenNote,
          estimatedWaitTime: data.estimatedWaitTime ?? prev.estimatedWaitTime
        } : prev);
      }
    };

    const handleKitchenShout = (data) => {
      if (data.tokenNumber === decoded) {
        // Add to thread locally for immediate feedback
        setOrder(prev => prev ? {
          ...prev,
          thread: [...(prev.thread || []), {
            sender: data.senderName || 'Kitchen',
            role: 'kitchen',
            message: data.message,
            timestamp: data.timestamp
          }]
        } : prev);

        // Show toast
        setShoutToast(data.message);
        clearTimeout(toastTimeout.current);
        toastTimeout.current = setTimeout(() => setShoutToast(null), 6000);
      }
    };

    socket.on('update_status', handleStatusUpdate);
    socket.on('kitchen_shout', handleKitchenShout);

    return () => {
      socket.off('update_status', handleStatusUpdate);
      socket.off('kitchen_shout', handleKitchenShout);
    };
  }, [socket, tokenNumber]);

  const handleSendInstruction = async (message) => {
    if (!order?._id) {
      // Optimistically add to thread even without API
      setOrder(prev => ({
        ...prev,
        thread: [...(prev.thread || []), { sender: 'Customer', role: 'customer', message, timestamp: new Date() }]
      }));
      return;
    }
    try {
      const { data } = await API.post(`/orders/${order._id}/instruction`, { message, sender: 'Customer' });
      setOrder(prev => ({ ...prev, thread: data.thread }));
    } catch {
      // Fallback: add locally
      setOrder(prev => ({
        ...prev,
        thread: [...(prev.thread || []), { sender: 'Customer', role: 'customer', message, timestamp: new Date() }]
      }));
    }
  };

  if (loading) return <div className="loading-screen"><div className="spinner" /></div>;

  const statusLabel = { placed: 'Order Placed', confirmed: 'Confirmed', preparing: 'Preparing your meal', ready: 'Ready for Pickup!', served: 'Served' };
  const estTime = order?.placedAt ? new Date(new Date(order.placedAt).getTime() + (order.estimatedWaitTime || 15) * 60000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--';
  const statusBadge = order?.status === 'ready' ? 'READY' : order?.status === 'preparing' ? 'PREPARING' : 'PLACED';

  return (
    <div style={{ minHeight: '100vh', paddingBottom: 30 }}>
      {/* Kitchen Shout Toast */}
      {shoutToast && (
        <div style={{
          position: 'fixed', top: 14, left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(232,163,23,0.12)', border: '1px solid rgba(232,163,23,0.3)',
          borderRadius: 12, padding: '12px 20px', zIndex: 9999, backdropFilter: 'blur(10px)',
          color: '#F5F0E8', fontSize: '0.88rem', maxWidth: 320, textAlign: 'center'
        }}>
          👨‍🍳 <strong>Chef says:</strong> {shoutToast}
        </div>
      )}

      {/* Header */}
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: '1px solid rgba(232,163,23,0.1)' }}>
        <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', color: '#F5F0E8', cursor: 'pointer' }}><FiArrowLeft size={20}/></button>
        <h1 style={{ fontFamily: "'Outfit', sans-serif", fontSize: '1rem', fontWeight: 700 }}>Track Your Order</h1>
        <FiMoreVertical size={20} color="#A89B8C" />
      </header>

      {/* Status Hero */}
      <div className="animate-slide" style={{ textAlign: 'center', padding: '30px 16px 20px' }}>
        <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>🍛</div>
        <h2 style={{ fontFamily: "'Outfit', sans-serif", fontSize: '1.3rem', fontWeight: 700, marginBottom: 4 }}>
          {statusLabel[order?.status] || 'Preparing your meal'}
        </h2>
        <p style={{ color: '#A89B8C', fontSize: '0.85rem' }}>Estimated arrival at {estTime}</p>
      </div>

      {/* Token Number */}
      <div style={{ padding: '0 16px', marginBottom: 16 }} className="animate-fade">
        <div style={{ background: 'linear-gradient(135deg, rgba(232,163,23,0.12), rgba(232,163,23,0.04))', border: '1px solid rgba(232,163,23,0.2)', borderRadius: 14, padding: '16px', textAlign: 'center' }}>
          <div style={{ fontSize: '0.7rem', color: '#E8A317', letterSpacing: 1.5, fontWeight: 600, marginBottom: 6 }}>ORDER TOKEN NUMBER</div>
          <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: '2rem', fontWeight: 800, color: '#E8A317' }}>{order?.tokenNumber || '#A-000'}</div>
        </div>
      </div>

      {/* Kitchen Pulse */}
      <div style={{ padding: '0 16px', marginBottom: 16 }} className="animate-fade">
        <div style={{ background: '#1a1208', border: '1px solid rgba(232,163,23,0.12)', borderRadius: 14, padding: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#E8A317', animation: 'pulse 2s infinite' }} />
              <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>Live Kitchen Pulse</span>
            </div>
            <span className="badge badge-amber">{statusBadge}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: '0.85rem', color: '#A89B8C' }}>Kitchen Progress</span>
            <span style={{ fontWeight: 700, fontSize: '1.1rem', color: '#E8A317' }}>{order?.kitchenProgress || 0}%</span>
          </div>
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${order?.kitchenProgress || 0}%` }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, fontSize: '0.78rem', color: '#6B5E50' }}>
            <FiClock size={12} /> {order?.kitchenNote || 'Order received, waiting for kitchen confirmation'}
          </div>
        </div>
      </div>

      {/* Status Timeline */}
      <div style={{ padding: '0 16px 16px' }} className="animate-fade">
        {[
          { label: 'Order Confirmed', time: new Date(order?.placedAt || Date.now()).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}), done: true },
          { label: 'Preparing in Kitchen', sub: order?.status === 'preparing' ? 'In Progress' : order?.status === 'ready' ? 'Done' : 'Pending', done: ['preparing','ready','served'].includes(order?.status) },
          { label: 'Ready for Pickup', sub: 'Pending', done: ['ready', 'served'].includes(order?.status) }
        ].map((step, i) => (
          <div key={i} style={{ display: 'flex', gap: 14, paddingBottom: 20, position: 'relative' }}>
            {i < 2 && <div style={{ position: 'absolute', left: 11, top: 28, width: 2, height: 'calc(100% - 28px)', background: step.done ? 'rgba(232,163,23,0.3)' : 'rgba(232,163,23,0.08)' }} />}
            <div style={{ width: 24, height: 24, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, background: step.done ? 'rgba(34,197,94,0.15)' : '#1a1208', border: `2px solid ${step.done ? '#22C55E' : '#333'}` }}>
              {step.done && <FiCheckCircle size={12} color="#22C55E" />}
            </div>
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.9rem', color: step.done ? '#22C55E' : '#F5F0E8' }}>{step.label}</div>
              <div style={{ fontSize: '0.78rem', color: '#6B5E50' }}>{step.time || step.sub}</div>
            </div>
          </div>
        ))}
      </div>

      {/* OrderThread — Bidirectional Chat */}
      <OrderThread order={order} onSendInstruction={handleSendInstruction} />

      {/* Order Summary */}
      <div style={{ padding: '0 16px', margin: '0 0 20px' }}>
        <div style={{ background: '#1a1208', border: '1px solid rgba(232,163,23,0.08)', borderRadius: 14, padding: 16 }}>
          <h3 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: 10 }}>Order Summary</h3>
          {order?.items?.map((it, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: 6 }}>
              <span style={{ color: '#A89B8C' }}>{it.quantity}x {it.name}</span>
              <span>₹{(it.price * it.quantity).toFixed(2)}</span>
            </div>
          ))}
          {order?.subtotal > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: '#6B5E50', marginTop: 8 }}>
              <span>Subtotal</span><span>₹{order.subtotal?.toFixed(2)}</span>
            </div>
          )}
          {order?.tax > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: '#6B5E50', marginTop: 4 }}>
              <span>Tax</span><span>₹{order.tax?.toFixed(2)}</span>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(232,163,23,0.08)', fontWeight: 700, color: '#22C55E' }}>
            <span>Total Amount</span>
            <span>{order?.isDemoOrder ? '₹0 (Demo)' : `₹${order?.total?.toFixed(2) || '0.00'}`}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
