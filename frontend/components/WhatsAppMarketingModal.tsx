import React, { useState } from 'react';
import { 
  MessageSquare, Send, X, Users, MessageCircle, 
  Sparkles, Check, ChevronRight, Copy 
} from 'lucide-react';
import { getPlaceholder } from '../constants/placeholders';

const AI_TEMPLATES = [
  {
    id: 'promo',
    name: 'Sales Promotion',
    description: 'Perfect for announcing new products or seasonal sales',
    content: "Hi! 🌟 We have some exciting new offers at [Company Name]! Check out our latest premium collection and get exclusive deals. Reply 'YES' to see our catalog! 🛍️"
  },
  {
    id: 'invoice',
    name: 'Invoice Reminder',
    description: 'A polite nudge for outstanding payments',
    content: "Hello [Customer Name], this is a friendly reminder from [Company Name] regarding your outstanding invoice #[Invoice Number]. 📄 You can securely view and complete your payment online. Thank you! 🙏"
  },
  {
    id: 'order',
    name: 'Order Confirmation',
    description: 'Keep customers informed about their purchases',
    content: "Great news! 🎉 Your order #[Order Number] has been successfully confirmed at [Company Name] and is now being processed. We'll notify you once it's on its way! 🚚"
  },
  {
    id: 'greeting',
    name: 'Welcome Message',
    description: 'Greet new customers and build rapport',
    content: "Hi there! Welcome to [Company Name]. 🤝 We're thrilled to have you with us. If you have any questions about our services, feel free to ask anytime. We're here to help! ✨"
  },
  {
    id: 'payment_received',
    name: 'Payment Received',
    description: 'Confirm payment receipt for orders',
    content: "Hi [Customer Name]! ✅ Payment of [Amount] has been successfully received for invoice #[Invoice Number] at [Company Name]. Thank you for your prompt payment! 🎉"
  },
  {
    id: 'order_ready',
    name: 'Order Ready for Pickup',
    description: 'Notify customer their order is ready',
    content: "Hi [Customer Name]! 📦 Your order #[Order Number] from [Company Name] is ready for pickup! Visit us during business hours to collect your order. Questions? Just reply! 😊"
  },
  {
    id: 'order_shipped',
    name: 'Order Shipped',
    description: 'Notify customer their order has been shipped',
    content: "Hi [Customer Name]! 🚚 Great news! Your order #[Order Number] from [Company Name] has been shipped! Track it using: [Tracking Link]. Expected delivery: [Delivery Date]. 📦"
  },
  {
    id: 'quote_request',
    name: 'Quote Request',
    description: 'Follow up on a requested quote',
    content: "Hi [Customer Name]! 📋 Thank you for your interest in [Company Name]. We'd love to provide you with a quote for [Product/Service]. Please reply with your requirements and we'll get back to you within 24 hours! 💼"
  },
  {
    id: 'thank_you',
    name: 'Thank You Message',
    description: 'Express gratitude after a purchase',
    content: "Hi [Customer Name]! 🙏 Thank you for choosing [Company Name]! We really appreciate your business. If you have any feedback or questions about [Product/Service], please don't hesitate to reach out. We'd love to hear from you! ⭐"
  },
  {
    id: 'birthday',
    name: 'Birthday Wish',
    description: 'Send birthday greetings to customers',
    content: "Hi [Customer Name]! 🎂 Happy Birthday from [Company Name]! 🎉 We hope you have an amazing day! As our special gift, enjoy [Discount/ Offer] on your next visit. Celebrate with us! 🎁"
  },
  {
    id: 'loyalty',
    name: 'Loyalty Reward',
    description: 'Reward loyal customers',
    content: "Hi [Customer Name]! 🌟 As a valued customer of [Company Name], we want to thank you for your loyalty! 🎁 Here's an exclusive offer just for you: [Special Offer]. Valid until [Expiry Date]. Enjoy! 🎉"
  },
  {
    id: 'restock',
    name: 'Item Restocked',
    description: 'Notify customers about restocked items',
    content: "Hi [Customer Name]! 🔔 Great news from [Company Name]! Your favorite [Product Name] is back in stock! Supplies are limited, so order now before they run out! 🛒"
  },
  {
    id: 'appointment',
    name: 'Appointment Reminder',
    description: 'Remind customers about upcoming appointments',
    content: "Hi [Customer Name]! 📅 This is a friendly reminder about your upcoming appointment at [Company Name] on [Date] at [Time]. We're looking forward to seeing you! ⏰ Reply to confirm or reschedule."
  },
  {
    id: 'feedback',
    name: 'Feedback Request',
    description: 'Request feedback after service',
    content: "Hi [Customer Name]! 💬 Thank you for visiting [Company Name]. We'd love to hear your feedback! Please take a moment to rate your experience or share your thoughts. Your input helps us serve you better! ⭐⭐⭐⭐⭐"
  },
  {
    id: 'service_complete',
    name: 'Service Complete',
    description: 'Notify customer their service is complete',
    content: "Hi [Customer Name]! ✅ Your [Service Name] at [Company Name] is complete! 🎉 Everything looks great. You can pick up your items anytime during business hours. Thank you for trusting us! 😊"
  },
  {
    id: 'subscription',
    name: 'Subscription Renewal',
    description: 'Remind about subscription renewal',
    content: "Hi [Customer Name]! 🔄 Your subscription with [Company Name] is about to renew on [Renewal Date]. Continue enjoying [Benefits]! No action needed if you'd like to keep your plan. Questions? Reply here! 📧"
  },
  {
    id: 'abandoned_cart',
    name: 'Cart Abandonment',
    description: 'Recover abandoned shopping carts',
    content: "Hi [Customer Name]! 🛒 You left something behind at [Company Name]! Your [Product(s)] are still in your cart. Complete your purchase today and enjoy [Special Offer]! Valid for [Time Period]. 😊"
  },
    {
      id: 'referral',
      name: 'Referral Program',
      description: 'Invite customers to refer friends',
      content: "Hi [Customer Name]! 🤝 Love [Company Name]? Share the goodness! Refer a friend and you'll both get [Reward] when they make their first purchase. Send them your unique link: [Referral Link]. Let's grow together! 🎉"
    },
    {
      id: 'promotion',
      name: 'General Promotion',
      description: 'A generic promotional message for discounts or events',
      content: "Hi [Customer Name]! 🎈 Don't miss our latest promotion at [Company Name] – enjoy [Discount]% off on selected items. Visit us today and save! 🚀"
    },
    {
      id: 'top_customer',
      name: 'Top Customer Appreciation',
      description: 'Reward your best customers with a special offer',
      content: "Hello [Customer Name]! 🌟 As one of our top customers, we’re delighted to give you an exclusive [Discount]% discount on your next purchase at [Company Name]. Thank you for your loyalty! 🎉"
    },
    {
      id: 'year_end_offer',
      name: 'Year-End Offer',
      description: 'Seasonal year‑end discount promotion',
      content: "Hi [Customer Name]! 🎉 Celebrate the end of the year with an exclusive [Discount]% off on all products at [Company Name]. Use code YEAREND2026 at checkout. Offer valid until Dec 31. Happy Holidays! 🎁"
    },
    {
      id: 'special_offer',
      name: 'Special Offer',
      description: 'A limited‑time special deal',
      content: "Hi [Customer Name]! 🎁 We're offering a special deal just for you: [Offer Detail] at [Company Name]. Grab it before it’s gone! 🕒"
    },
    {
      id: 'new_arrival',
      name: 'New Arrival Announcement',
      description: 'Announce a brand‑new product',
      content: "Hi [Customer Name]! 🌟 New arrivals are in at [Company Name]: [Product Name]. Explore now and enjoy an introductory [Discount]% off! 🎉"
    }
];

interface WhatsAppMarketingModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyName: string;
}

const WhatsAppMarketingModal: React.FC<WhatsAppMarketingModalProps> = ({ 
  open, 
  onOpenChange,
  companyName
}) => {
  const [recipient, setRecipient] = useState('');
  const [message, setMessage] = useState('');
  const [sendToGroup, setSendToGroup] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<'templates' | 'message'>('templates');

  const handleApplyTemplate = (template: typeof AI_TEMPLATES[0]) => {
    let content = template.content.replace(/\[Company Name\]/g, companyName || 'Prime ERP');
    setMessage(content);
    setSelectedTemplate(template.id);
    setActiveSection('message');
  };

  const handleSend = () => {
    if (!message.trim()) return;

    let url = '';
    if (sendToGroup) {
      url = `https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`;
    } else {
      const cleanPhone = recipient.replace(/[^0-9]/g, '');
      if (!cleanPhone) {
        alert('Please enter a valid phone number for direct messaging.');
        return;
      }
      url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
    }

    window.open(url, '_blank', 'noopener,noreferrer');
    onOpenChange(false);
  };

  const handleClose = () => {
    setRecipient('');
    setMessage('');
    setSendToGroup(false);
    setSelectedTemplate(null);
    setActiveSection('templates');
    onOpenChange(false);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
        onClick={handleClose}
      />

      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-100 rounded-lg">
              <MessageSquare className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800">
                WhatsApp Marketing
              </h2>
              <p className="text-xs text-slate-500">
                Send marketing messages to customers
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleSend}
              disabled={!message.trim() || (!sendToGroup && !recipient.trim())}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Send className="w-4 h-4" />
              Launch WhatsApp
            </button>
            <button
              onClick={handleClose}
              className="p-2 hover:bg-slate-200 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-slate-500" />
            </button>
          </div>
        </div>

        <div className="flex border-t border-slate-200">
          <div className="w-48 bg-slate-50 border-r border-slate-200 py-4">
            <button
              onClick={() => setActiveSection('templates')}
              className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium transition-colors ${
                activeSection === 'templates'
                  ? 'bg-emerald-50 text-emerald-600 border-r-2 border-emerald-600'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Sparkles className="w-4 h-4" />
              Templates
            </button>
            <button
              onClick={() => setActiveSection('message')}
              className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium transition-colors ${
                activeSection === 'message'
                  ? 'bg-emerald-50 text-emerald-600 border-r-2 border-emerald-600'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <MessageCircle className="w-4 h-4" />
              Message
            </button>
          </div>

          <div className="flex-1 overflow-y-auto">
            <div className="p-6">
              {activeSection === 'templates' && (
                <div className="space-y-4 max-h-[65vh] overflow-y-auto pr-4 custom-scrollbar">
                  <h3 className="text-sm font-semibold text-slate-700 mb-4">AI-Generated Templates</h3>
                  {AI_TEMPLATES.map((template) => (
                    <button
                      key={template.id}
                      onClick={() => handleApplyTemplate(template)}
                      className={`w-full text-left p-4 rounded-xl border transition-all duration-200 group ${
                        selectedTemplate === template.id 
                          ? 'bg-emerald-50 border-emerald-200 shadow-sm' 
                          : 'bg-white border-slate-200 hover:border-emerald-300 hover:shadow-md'
                      }`}
                    >
                      <div className="flex justify-between items-start mb-1">
                        <span className={`font-semibold ${selectedTemplate === template.id ? 'text-emerald-700' : 'text-slate-700'}`}>
                          {template.name}
                        </span>
                        {selectedTemplate === template.id && (
                          <Check size={16} className="text-emerald-600" />
                        )}
                      </div>
                      <p className="text-xs text-slate-500 leading-relaxed group-hover:text-slate-600">
                        {template.description}
                      </p>
                    </button>
                  ))}
                  
                  <div className="mt-4 p-4 rounded-xl bg-indigo-50 border border-indigo-100">
                    <p className="text-[11px] text-indigo-600/70 uppercase font-bold tracking-widest flex items-center gap-2">
                      <Sparkles size={10} /> Pro Tip
                    </p>
                    <p className="text-xs text-slate-600 mt-1">
                      Use placeholders like [Customer Name] to personalize your messages before sending.
                    </p>
                  </div>
                </div>
              )}

              {activeSection === 'message' && (
                <div className="space-y-6 max-h-[65vh] overflow-y-auto pr-4 custom-scrollbar">
                  <div className="flex gap-2 p-1 bg-slate-100 rounded-xl">
                    <button
                      onClick={() => setSendToGroup(false)}
                      className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
                        !sendToGroup ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                      }`}
                    >
                      <MessageCircle size={16} /> Direct
                    </button>
                    <button
                      onClick={() => setSendToGroup(true)}
                      className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
                        sendToGroup ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                      }`}
                    >
                      <Users size={16} /> Group/Anyone
                    </button>
                  </div>

                  {!sendToGroup && (
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        Phone Number
                      </label>
                      <input
                        type="text"
                        placeholder={getPlaceholder.phone()}
                        value={recipient}
                        onChange={(e) => setRecipient(e.target.value)}
                        className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                      />
                    </div>
                  )}

                  {sendToGroup && (
                    <div className="p-4 rounded-xl bg-orange-50 border border-orange-100">
                      <p className="text-xs text-orange-700 font-medium">
                        Choosing "Group/Anyone" will open WhatsApp and let you select from your contacts or groups to send the message.
                      </p>
                    </div>
                  )}

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Message Content
                    </label>
                    <textarea
                      rows={8}
                      placeholder="e.g. Hi there! We have an exciting new collection..."
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all resize-none text-slate-700 leading-relaxed"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WhatsAppMarketingModal;