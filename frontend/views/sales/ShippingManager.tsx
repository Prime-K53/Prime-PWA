import React, { useState, useMemo, useRef, useEffect } from 'react';
import { 
  Truck, Package, MapPin, Search, 
  Download, Box, 
  CheckCircle, 
  Info, X, Trash2, ShieldCheck, MessageSquare, Navigation, CheckSquare, 
  Eye, UserPlus, Car, Upload, FileSearch, Globe
} from 'lucide-react';
import { useData } from '../../context/DataContext';
import { Shipment, DeliveryNote, Employee, SignatureInputMode } from '../../types';
import { format } from 'date-fns';
import { pdf } from '@react-pdf/renderer';
import { PrimeDocument } from '../shared/components/PDF/PrimeDocument';
import { initializePrimePdfFonts } from '../shared/components/PDF/templateSettings';
import { useDocumentPreview } from '../../hooks/useDocumentPreview';
import { mapToInvoiceData } from '../../utils/pdfMapper';
import { transactionService } from '../../services/transactionService';
import { normalizeSignatureDataUrl, validateSignatureUploadFile } from '../../utils/signatureUtils';
import { attachDocumentSecurity } from '../../utils/documentSecurity';
import { enrichDocumentCustomerData } from '../../utils/documentCustomerData';
import { getPlaceholder } from '../../constants/placeholders';

const carriers = ['Own Delivery', 'DHL', 'FedEx', 'UPS', 'Local Courier', 'SpeedAF', 'Fargo Courier'];
const DELIVERY_POD_RECONCILE_KEY = 'prime_shipping_pod_reconcile_v1';

const ShippingManager: React.FC = () => {
    const { deliveryNotes, companyConfig, notify, shipments, customers, employees = [], fetchSalesData, fetchFinanceData } = useData();
    const { handlePreview } = useDocumentPreview();
    const [searchTerm, setSearchTerm] = useState('');
    const [activeTab, setActiveTab] = useState<'Pipeline' | 'Active' | 'History'>('Pipeline');

    const signatureUploadInputRef = useRef<HTMLInputElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [isDrawing, setIsDrawing] = useState(false);

    // Delivery Modal
    const [showDeliveryModal, setShowDeliveryModal] = useState(false);
    const [deliveryTarget, setDeliveryTarget] = useState<Shipment | null>(null);
    const [deliveryNoteTarget, setDeliveryNoteTarget] = useState<DeliveryNote | null>(null);
    
    // Delivery Form State
    const [recipientName, setRecipientName] = useState('');
    const [recipientPhone, setRecipientPhone] = useState('');
    const [deliveryNotesText, setDeliveryNotesText] = useState('');
    const [manualTimestamp, setManualTimestamp] = useState(new Date().toISOString().slice(0, 16));
    const [manualGps, setManualGps] = useState({ lat: '', lng: '' });
    const [signatureInputMode, setSignatureInputMode] = useState<SignatureInputMode>('Draw');
    const [drawnSignatureDataUrl, setDrawnSignatureDataUrl] = useState<string | null>(null);
    const [uploadedSignatureDataUrl, setUploadedSignatureDataUrl] = useState<string | null>(null);
    const [isSavingDelivery, setIsSavingDelivery] = useState(false);

    // Dispatch Modal State
    const [isDispatchModalOpen, setIsDispatchModalOpen] = useState(false);
    const [dispatchTarget, setDispatchTarget] = useState<DeliveryNote | null>(null);
    const [isAddingNewDriver, setIsAddingNewDriver] = useState(false);
    const [dispatchForm, setDispatchForm] = useState({
        carrier: 'Own Delivery',
        driverId: '',
        newDriverName: '',
        vehicleNo: '',
        estArrival: new Date(Date.now() + 86400000).toISOString().slice(0, 16),
        cost: 0
    });

    const payrollDrivers = useMemo(() => employees.filter((e: Employee) => e.status === 'Active'), [employees]);

    const pendingDeliveries = useMemo(() => 
        deliveryNotes.filter(dn => dn.status === 'Pending'), 
    [deliveryNotes]);

    const filteredDeliveries = pendingDeliveries.filter(dn => 
        dn.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        dn.id.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const filteredShipments = useMemo(() => {
        let list = shipments || [];
        if (activeTab === 'History') list = list.filter(s => s.status === 'Delivered' || s.status === 'Cancelled');
        else if (activeTab === 'Active') list = list.filter(s => s.status !== 'Delivered' && s.status !== 'Cancelled');
        else if (activeTab === 'Pipeline') list = []; // Pipeline shows pending delivery notes, not shipments
        
        return list.filter(s => 
            s.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
            s.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
            s.trackingNumber.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [shipments, activeTab, searchTerm]);

    const activeSignatureDataUrl = signatureInputMode === 'Draw' ? drawnSignatureDataUrl : uploadedSignatureDataUrl;
    const canFinalizeDelivery = Boolean(recipientName.trim()) && Boolean(activeSignatureDataUrl) && !isSavingDelivery;

    const syncShippingState = async () => {
        await Promise.all([
            typeof fetchSalesData === 'function' ? fetchSalesData() : Promise.resolve(),
            typeof fetchFinanceData === 'function' ? fetchFinanceData() : Promise.resolve(),
        ]);
    };

    const initializeSignatureCanvas = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const rect = canvas.getBoundingClientRect();
        const cssWidth = rect.width || 600;
        const cssHeight = rect.height || 192;
        const pixelRatio = Math.max(window.devicePixelRatio || 1, 1);

        canvas.width = Math.floor(cssWidth * pixelRatio);
        canvas.height = Math.floor(cssHeight * pixelRatio);

        ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
        ctx.clearRect(0, 0, cssWidth, cssHeight);
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = '#0f172a';
    };

    useEffect(() => {
        if (!showDeliveryModal) return;
        initializeSignatureCanvas();
    }, [showDeliveryModal]);

    useEffect(() => {
        const reconcileProofs = async () => {
            try {
                const alreadyReconciled = localStorage.getItem(DELIVERY_POD_RECONCILE_KEY);
                if (alreadyReconciled) return;

                const result = await transactionService.reconcileLegacyShipmentProofToDeliveryNotes();
                localStorage.setItem(DELIVERY_POD_RECONCILE_KEY, new Date().toISOString());

                if (result?.updatedCount > 0) {
                    await syncShippingState();
                    notify(`Reconciled ${result.updatedCount} legacy delivery proof record(s).`, "info");
                }
            } catch (error) {
                console.error('Legacy proof reconciliation failed:', error);
            }
        };

        void reconcileProofs();
    }, []);

    const handleOpenDispatch = (dn: DeliveryNote) => {
        setDispatchTarget(dn);
        setDispatchForm(prev => ({ 
            ...prev, 
            driverId: payrollDrivers[0]?.id || '', 
            newDriverName: '', 
            vehicleNo: dn.vehicleNo || ''
        }));
        setIsAddingNewDriver(false);
        setIsDispatchModalOpen(true);
    };

    const handleConfirmDispatch = async () => {
        if (!dispatchTarget) return;

        const id = `SHP-${Date.now().toString().slice(-4)}`;
        const driverName = isAddingNewDriver 
            ? dispatchForm.newDriverName 
            : payrollDrivers.find(e => e.id === dispatchForm.driverId)?.name || 'Unknown';

        const newShipment: Shipment = {
            id,
            orderId: dispatchTarget.id,
            customerName: dispatchTarget.customerName,
            carrier: dispatchForm.carrier,
            driverId: isAddingNewDriver ? undefined : dispatchForm.driverId,
            driverName: driverName,
            vehicleNo: dispatchForm.vehicleNo,
            trackingNumber: 'TRK-' + Math.random().toString(36).substring(7).toUpperCase(),
            weight: 1.0,
            weightUnit: 'kg',
            dimensions: { l: 0, w: 0, h: 0 },
            status: 'In Transit',
            shippingCost: dispatchForm.cost,
            estimatedDelivery: new Date(dispatchForm.estArrival).toISOString(),
        };

        try {
            await transactionService.updateShipmentStatus(newShipment, {
                id: dispatchTarget.id,
                status: 'In Transit',
                carrier: dispatchForm.carrier,
                driverName,
                vehicleNo: dispatchForm.vehicleNo,
                trackingNumber: newShipment.trackingNumber,
                estimatedDelivery: newShipment.estimatedDelivery,
            });
            await syncShippingState();
            notify(`Manifest synchronized. Driver ${driverName} dispatched.`, "success");
            setIsDispatchModalOpen(false);
            setActiveTab('Active');
        } catch (error: any) {
            console.error('Dispatch manifest sync failed:', error);
            notify(`Dispatch failed: ${error?.message || 'Unknown error'}`, "error");
        }
    };

    const handleMarkDelivered = (shp: Shipment) => {
        setDeliveryTarget(shp);
        const dn = deliveryNotes.find(d => d.id === shp.orderId);
        setDeliveryNoteTarget(dn || null);
        
        // Reset form
        setRecipientName(shp.customerName);
        setRecipientPhone('');
        setDeliveryNotesText('');
        setManualTimestamp(new Date().toISOString().slice(0, 16));
        setManualGps({ lat: '', lng: '' });
        setSignatureInputMode('Draw');
        setDrawnSignatureDataUrl(null);
        setUploadedSignatureDataUrl(null);
        if (signatureUploadInputRef.current) {
            signatureUploadInputRef.current.value = '';
        }
        
        // Auto-trace GPS
        if ("geolocation" in navigator) {
            navigator.geolocation.getCurrentPosition((position) => {
                setManualGps({
                    lat: position.coords.latitude.toString(),
                    lng: position.coords.longitude.toString()
                });
            }, (error) => {
                console.error("GPS trace failed:", error);
                notify("GPS trace failed. Please enter manually if required.", "info");
            });
        }
        
        setShowDeliveryModal(true);
    };

    const getCanvasPoint = (e: React.PointerEvent<HTMLCanvasElement>) => {
        const canvas = canvasRef.current;
        if (!canvas) return null;

        const rect = canvas.getBoundingClientRect();
        return {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        };
    };

    const startDrawing = (e: React.PointerEvent<HTMLCanvasElement>) => {
        if (signatureInputMode !== 'Draw') return;
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        const point = getCanvasPoint(e);
        if (!canvas || !ctx || !point) return;

        ctx.beginPath();
        ctx.moveTo(point.x, point.y);
        if (canvas.setPointerCapture) {
            canvas.setPointerCapture(e.pointerId);
        }
        setIsDrawing(true);
        setDrawnSignatureDataUrl(null);
    };

    const stopDrawing = (e?: React.PointerEvent<HTMLCanvasElement>) => {
        if (!isDrawing) return;
        setIsDrawing(false);
        const canvas = canvasRef.current;
        if (canvas) {
            if (e && canvas.hasPointerCapture?.(e.pointerId)) {
                canvas.releasePointerCapture(e.pointerId);
            }
            setDrawnSignatureDataUrl(normalizeSignatureDataUrl(canvas.toDataURL('image/png')));
        }
    };

    const draw = (e: React.PointerEvent<HTMLCanvasElement>) => {
        if (!isDrawing || signatureInputMode !== 'Draw') return;
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        const point = getCanvasPoint(e);
        if (!canvas || !ctx || !point) return;

        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.strokeStyle = '#0f172a';
        ctx.lineTo(point.x, point.y);
        ctx.stroke();
    };

    const clearSignature = () => {
        if (signatureInputMode === 'Upload') {
            setUploadedSignatureDataUrl(null);
            if (signatureUploadInputRef.current) {
                signatureUploadInputRef.current.value = '';
            }
            return;
        }

        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (canvas && ctx) {
            const pixelRatio = Math.max(window.devicePixelRatio || 1, 1);
            const width = canvas.width / pixelRatio;
            const height = canvas.height / pixelRatio;
            ctx.clearRect(0, 0, width, height);
            setDrawnSignatureDataUrl(null);
        }
    };

    const handleSignatureUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        const validationError = validateSignatureUploadFile(file);
        if (validationError) {
            notify(validationError, "error");
            e.target.value = '';
            return;
        }

        if (!file) return;

        const reader = new FileReader();
        reader.onload = (ev) => {
            const normalized = normalizeSignatureDataUrl(ev.target?.result as string);
            if (!normalized) {
                notify('Uploaded signature format is invalid.', "error");
                return;
            }
            setUploadedSignatureDataUrl(normalized);
        };
        reader.readAsDataURL(file);
    };

    const handleCaptureDelivery = async () => {
        if (!deliveryTarget || !deliveryNoteTarget) return;
        if (!recipientName.trim()) {
            notify("Recipient name is required.", "error");
            return;
        }
        if (!activeSignatureDataUrl) {
            notify("Signature required to seal delivery certificate.", "error");
            return;
        }

        // Final GPS capture attempt
        let finalLocation = { 
            lat: parseFloat(manualGps.lat) || 0, 
            lng: parseFloat(manualGps.lng) || 0 
        };

        if ("geolocation" in navigator) {
            try {
                const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
                    navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 });
                });
                finalLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
            } catch (err) {
                console.warn("Final GPS capture failed, using previous trace:", err);
            }
        }

        const parsedTimestamp = new Date(manualTimestamp);
        const timestamp = Number.isNaN(parsedTimestamp.getTime())
            ? new Date().toISOString()
            : parsedTimestamp.toISOString();
        const notesText = deliveryNotesText.trim();
        const normalizedPhone = recipientPhone.trim();
        const normalizedRecipient = recipientName.trim();

        const updatedShipment: Shipment = {
            ...deliveryTarget,
            status: 'Delivered',
            actualArrival: timestamp,
            currentLocation: finalLocation,
            proofOfDelivery: {
                receivedBy: normalizedRecipient,
                recipientPhone: normalizedPhone || undefined,
                signatureDataUrl: activeSignatureDataUrl,
                signature: activeSignatureDataUrl,
                signatureInputMode,
                timestamp: timestamp,
                locationStamp: finalLocation,
                notes: notesText || undefined,
                remarks: notesText || undefined
            }
        };

        try {
            setIsSavingDelivery(true);
            await transactionService.updateShipmentStatus(updatedShipment, {
                id: deliveryNoteTarget.id,
                status: 'Delivered',
                actualArrival: timestamp,
                currentLocation: finalLocation,
                carrier: deliveryTarget.carrier,
                driverName: deliveryTarget.driverName,
                vehicleNo: deliveryTarget.vehicleNo,
                trackingNumber: deliveryTarget.trackingNumber,
                proofOfDelivery: updatedShipment.proofOfDelivery,
            });
            await syncShippingState();
            notify("Delivery Sealed: Signature & GPS Coordinates Verified.", "success");
            setShowDeliveryModal(false);
            setDeliveryTarget(null);
            setActiveTab('History');
        } catch (err: any) {
            console.error("Delivery update failed:", err);
            notify(`Failed to finalize delivery: ${err?.message || 'Unknown error'}`, "error");
        } finally {
            setIsSavingDelivery(false);
        }
    };

    const handleScanReceived = () => {
        notify("Scan Received Image is temporarily disabled until extraction support is implemented.", "info");
    };

    const handleNotifyClient = async (shp: Shipment) => {
        const cust = customers.find(c => c.name === shp.customerName);
        const phone = (cust?.contact || (cust as any)?.phone || '').replace(/\s+/g, '');
        const eta = shp.estimatedDelivery ? format(new Date(shp.estimatedDelivery), 'MMM d, HH:mm') : 'N/A';
        const companyName = companyConfig?.companyName || 'our company';
        const msg = `Hello ${shp.customerName}, your order #${shp.orderId} is currently ${shp.status.toLowerCase()}. \n\nTracking: ${shp.trackingNumber}\nEst. Arrival: ${eta}\n\nThank you for choosing ${companyName}.`;

        if (phone) {
            try {
                window.location.href = `sms:${phone}?body=${encodeURIComponent(msg)}`;
                notify("Opening default SMS application...", "info");
                return;
            } catch (error) {
                console.error('Failed to open sms deep link:', error);
            }
        }

        if (navigator.clipboard?.writeText) {
            try {
                await navigator.clipboard.writeText(msg);
                notify(
                    phone
                        ? `SMS deep link unavailable. Message copied for ${phone}.`
                        : 'No recipient phone available. Message copied to clipboard.',
                    "info"
                );
                return;
            } catch (error) {
                console.error('Clipboard write failed:', error);
            }
        }

        notify('Unable to open SMS app or copy message automatically on this desktop.', "error");
    };

    const findDeliveryNote = (shp: Shipment) => deliveryNotes.find(d => d.id === shp.orderId);

    const handlePreviewDeliveryNote = (shp: Shipment) => {
        const dn = findDeliveryNote(shp);
        if (dn) {
            handlePreview('DELIVERY_NOTE', dn);
        } else {
            notify("Associated Delivery Note not found", "error");
        }
    };

    const handleDownloadDeliveryNote = (shp: Shipment) => {
        const dn = findDeliveryNote(shp);
        if (dn) {
            void handleDownloadPDF(dn);
        } else {
            notify("Associated Delivery Note not found", "error");
        }
    };

    const handleDownloadPDF = async (dn: DeliveryNote) => {
        try {
            notify("Preparing Delivery Note PDF...", "info");
            const enrichedDeliveryNote = enrichDocumentCustomerData(dn, customers);
            const pdfData = mapToInvoiceData(enrichedDeliveryNote, companyConfig, 'DELIVERY_NOTE');
            await initializePrimePdfFonts();
            const securedPdfData = await attachDocumentSecurity(pdfData, companyConfig?.companyName);
            const blob = await pdf(<PrimeDocument type="DELIVERY_NOTE" data={securedPdfData as any} />).toBlob();
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            const dnNumber = dn.dnNumber || dn.deliveryNoteNumber || dn.id || '';
            link.download = dnNumber ? `Delivery Note - ${dnNumber}.pdf` : `Delivery Note.pdf`;
            link.click();
            URL.revokeObjectURL(url);
            notify("Delivery Note PDF downloaded successfully", "success");
        } catch (error) {
            console.error("PDF generation failed:", error);
            notify("Failed to generate PDF", "error");
        }
    };

    return (
        <div className="h-[calc(100vh-4rem)] flex flex-col bg-[#f8fafc] font-sans overflow-hidden">
            
            <header className="px-10 py-6 border-b border-slate-200 bg-white/70 backdrop-blur-md flex justify-between items-center shrink-0">
                <div>
                    <h1 className="text-3xl font-black text-slate-900 uppercase tracking-tighter flex items-center gap-3">
                        <Truck size={32} className="text-blue-600"/> Logistics Command
                    </h1>
                    <p className="text-sm text-slate-500 mt-1">Proof of delivery processing and manifest management.</p>
                </div>
                <div className="flex items-center gap-4">
                    <div className="relative w-72">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                            type="text"
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            className="w-full pl-9 pr-3 py-2.5 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 bg-white focus:outline-none focus:ring-4 focus:ring-blue-500/10"
                            placeholder={activeTab === 'Pipeline' ? 'Search pending delivery notes...' : 'Search shipments...'}
                        />
                    </div>
                    <div className="flex bg-slate-100 p-1 rounded-2xl border border-slate-200 shadow-inner">
                        {[
                            { id: 'Pipeline', label: 'Inbound', icon: Package, count: filteredDeliveries.length },
                            { id: 'Active', label: 'Active', icon: Truck, count: (shipments || []).filter(s => s.status !== 'Delivered' && s.status !== 'Cancelled').length },
                            { id: 'History', label: 'History', icon: CheckCircle, count: (shipments || []).filter(s => s.status === 'Delivered').length }
                        ].map(tab => (
                            <button 
                                key={tab.id} 
                                onClick={() => setActiveTab(tab.id as any)}
                                className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${activeTab === tab.id ? 'bg-white text-blue-600 shadow-md scale-[1.02]' : 'text-slate-500 hover:text-slate-800'}`}
                            >
                                <tab.icon size={14}/>
                                {tab.label}
                                <span className={`px-1.5 py-0.5 rounded-full text-[8px] ${activeTab === tab.id ? 'bg-blue-100 text-blue-600' : 'bg-slate-200 text-slate-500'}`}>{tab.count}</span>
                            </button>
                        ))}
                    </div>
                    
                    <button 
                        onClick={handleScanReceived}
                        className="bg-slate-200 text-slate-600 px-5 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-300 transition-all flex items-center gap-2"
                    >
                        <FileSearch size={16}/>
                        Scan Received Image (Disabled)
                    </button>
                </div>
            </header>

            <div className="flex-1 overflow-y-auto p-10 custom-scrollbar">
                {activeTab === 'Pipeline' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-in fade-in slide-in-from-bottom-2">
                        {filteredDeliveries.map(dn => (
                            <div key={dn.id} id={`dn-card-${dn.id}`} className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm p-8 group hover:border-blue-400 hover:shadow-xl transition-all flex flex-col relative overflow-hidden">
                                <div className="mb-6">
                                    <div className="flex justify-between items-start">
                                        <span className="text-[9px] font-black text-blue-600 uppercase tracking-widest bg-blue-50 px-2 py-0.5 rounded-full border border-blue-100">Ready for dispatch</span>
                                    </div>
                                    <h3 className="text-xl font-black text-slate-900 mt-2 truncate">{dn.customerName}</h3>
                                    <p className="text-[10px] text-slate-400 font-bold uppercase mt-1">Delivery ID: {dn.id}</p>
                                </div>
                                <div className="absolute top-8 right-8 flex gap-2">
                                    <button 
                                        onClick={() => handlePreview('DELIVERY_NOTE', dn)}
                                        className="p-2 hover:bg-indigo-50 text-indigo-600 rounded-xl border border-transparent hover:border-indigo-100 transition-all"
                                        title="Preview PDF"
                                    >
                                        <Eye size={16}/>
                                    </button>
                                    <button 
                                        onClick={() => handleDownloadPDF(dn)}
                                        className="p-2 hover:bg-blue-50 text-blue-600 rounded-xl border border-transparent hover:border-blue-100 transition-all"
                                        title="Download PDF"
                                    >
                                        <Download size={16}/>
                                    </button>
                                </div>
                                <div className="flex-1 space-y-4 mb-8">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="flex items-start gap-3 flex-1">
                                            <MapPin size={16} className="text-rose-500 shrink-0 mt-0.5"/>
                                            <p className="text-xs text-slate-600 leading-relaxed font-medium line-clamp-2">{dn.shippingAddress}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center justify-between gap-3">
                                        <div className="flex items-center gap-3 flex-1">
                                            <Package size={16} className="text-slate-400 shrink-0"/>
                                            <p className="text-xs text-slate-600 font-bold">{dn.items.length} Items</p>
                                        </div>
                                    </div>
                                </div>
                                <button 
                                    onClick={() => handleOpenDispatch(dn)}
                                    className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-blue-600 transition-all shadow-lg active:scale-95 flex items-center justify-center gap-2"
                                >
                                    <Navigation size={14}/> Initiate Dispatch
                                </button>
                            </div>
                        ))}
                        {filteredDeliveries.length === 0 && <div className="col-span-full py-20 text-center text-slate-400 italic">Manifest pipeline clear. All pending notes are dispatched.</div>}
                    </div>
                )}

                {(activeTab === 'Active' || activeTab === 'History') && (
                    <div className="space-y-6">
                        {filteredShipments.map(shp => (
                            <div key={shp.id} className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden flex flex-col md:flex-row group transition-all hover:border-blue-200">
                                <div className="p-8 border-r border-slate-100 bg-slate-50/50 flex flex-col justify-center items-center text-center shrink-0 w-56">
                                    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-3 shadow-inner relative
                                        ${shp.status === 'Delivered' ? 'bg-emerald-100 text-emerald-600' : 'bg-blue-100 text-blue-600 animate-pulse'}`}>
                                        <Truck size={28}/>
                                    </div>
                                    <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">{shp.carrier}</div>
                                    <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase border tracking-widest ${shp.status === 'Delivered' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-blue-50 text-blue-600 border-blue-200'}`}>
                                        {shp.status}
                                    </span>
                                </div>

                                <div className="flex-1 p-8">
                                    <div className="flex justify-between items-start mb-6">
                                        <div>
                                            <h4 className="text-xl font-black text-slate-900 tracking-tight">{shp.customerName}</h4>
                                            <div className="flex items-center gap-3 mt-1">
                                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1"><Box size={10}/> {shp.orderId}</span>
                                                <span className="text-slate-200">•</span>
                                                <span className="text-[10px] font-mono font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded select-all cursor-copy">{shp.trackingNumber}</span>
                                            </div>
                                        </div>
                                        {shp.status !== 'Delivered' ? (
                                            <button 
                                                onClick={() => handleMarkDelivered(shp)}
                                                className="px-6 py-2.5 bg-emerald-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-700 shadow-xl shadow-emerald-900/10 transition-all flex items-center gap-2"
                                            >
                                                <CheckSquare size={14}/> Seal Proof of Delivery
                                            </button>
                                        ) : (
                                            <div className="flex gap-2">
                                                <button 
                                                    onClick={() => handlePreviewDeliveryNote(shp)}
                                                    className="px-4 py-2 bg-blue-50 text-blue-600 rounded-xl text-[10px] font-black uppercase hover:bg-blue-100 flex items-center gap-2"
                                                    title="Preview Delivery Note"
                                                >
                                                    <Eye size={14}/> Preview
                                                </button>
                                                <button 
                                                    onClick={() => handleDownloadDeliveryNote(shp)}
                                                    className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl text-[10px] font-black uppercase hover:bg-slate-200 flex items-center gap-2"
                                                    title="Download PDF"
                                                >
                                                    <Download size={14}/> Download
                                                </button>
                                            </div>
                                        )}
                                    </div>

                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                                        <div>
                                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Expected Arrival</p>
                                            <p className="text-sm font-bold text-slate-800">{shp.estimatedDelivery ? format(new Date(shp.estimatedDelivery), 'MMM d, HH:mm') : 'N/A'}</p>
                                        </div>
                                        {shp.actualArrival && (
                                            <div>
                                                <p className="text-[9px] font-black text-emerald-600 uppercase tracking-widest mb-1">Received Date</p>
                                                <p className="text-sm font-bold text-emerald-700">{format(new Date(shp.actualArrival), 'MMM d, HH:mm')}</p>
                                            </div>
                                        )}
                                        {shp.currentLocation && (
                                            <div>
                                                <p className="text-[9px] font-black text-blue-400 uppercase tracking-widest mb-1">Remote GPS Stamp</p>
                                                <p className="text-sm font-mono font-bold text-slate-500">{shp.currentLocation.lat.toFixed(4)}, {shp.currentLocation.lng.toFixed(4)}</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                                
                                <div className="bg-slate-50 p-8 flex flex-col justify-center gap-2 shrink-0 w-44">
                                    <button 
                                        onClick={() => void handleNotifyClient(shp)} 
                                        className="w-full py-2 bg-blue-600 text-white rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-blue-700 transition-all flex items-center justify-center gap-2"
                                    >
                                        <MessageSquare size={12}/> Update
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Dispatch Modal */}
            {isDispatchModalOpen && (
                <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col">
                        <div className="p-6 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                            <h3 className="font-black text-slate-900 uppercase tracking-tighter">Initiate Dispatch</h3>
                            <button onClick={() => setIsDispatchModalOpen(false)}><X size={20}/></button>
                        </div>
                        <div className="p-8 space-y-5">
                            <div>
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Fleet Carrier</label>
                                <select 
                                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold outline-none focus:ring-4 focus:ring-blue-500/5 transition-all"
                                    value={dispatchForm.carrier}
                                    onChange={e => setDispatchForm({...dispatchForm, carrier: e.target.value})}
                                >
                                    {carriers.map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                            </div>
                            
                            <div>
                                <div className="flex justify-between items-center mb-1.5 px-1">
                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Driver Name</label>
                                    <button 
                                        onClick={() => setIsAddingNewDriver(!isAddingNewDriver)}
                                        className="text-[9px] font-black text-blue-600 uppercase tracking-widest flex items-center gap-1 hover:underline"
                                    >
                                        {isAddingNewDriver ? <X size={10}/> : <UserPlus size={10}/>}
                                        {isAddingNewDriver ? 'Select Existing' : 'Add New Driver'}
                                    </button>
                                </div>
                                {isAddingNewDriver ? (
                                    <input 
                                        type="text"
                                        autoFocus
                                        className="w-full p-3 bg-white border-2 border-blue-100 rounded-2xl text-sm font-bold outline-none focus:border-blue-500 transition-all shadow-sm"
                                        placeholder="Enter full name..."
                                        value={dispatchForm.newDriverName}
                                        onChange={e => setDispatchForm({...dispatchForm, newDriverName: e.target.value})}
                                    />
                                ) : (
                                    <select 
                                        className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold outline-none focus:ring-4 focus:ring-blue-500/5 transition-all"
                                        value={dispatchForm.driverId}
                                        onChange={e => setDispatchForm({...dispatchForm, driverId: e.target.value})}
                                    >
                                        <option value="">-- Select Active Employee --</option>
                                        {payrollDrivers.map(d => <option key={d.id} value={d.id}>{d.name} ({d.role})</option>)}
                                    </select>
                                )}
                            </div>

                            <div>
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1 flex items-center gap-1.5"><Car size={12} className="text-blue-500"/> Vehicle No.</label>
                                <input 
                                    type="text" 
                                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold outline-none focus:ring-4 focus:ring-blue-500/5 transition-all uppercase"
                                    placeholder="e.g. ZA 1234"
                                    value={dispatchForm.vehicleNo}
                                    onChange={e => setDispatchForm({...dispatchForm, vehicleNo: e.target.value})}
                                />
                            </div>

                            <button 
                                onClick={handleConfirmDispatch} 
                                disabled={(isAddingNewDriver && !dispatchForm.newDriverName) || (!isAddingNewDriver && !dispatchForm.driverId && dispatchForm.carrier === 'Own Delivery')}
                                className="w-full py-4 bg-blue-600 text-white rounded-2xl font-black uppercase text-[10px] tracking-[0.2em] shadow-xl hover:bg-blue-700 transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50"
                            >
                                <Navigation size={16}/> Commit Dispatch Manifest
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Delivery Confirmation Modal (Seal Proof) */}
            {showDeliveryModal && deliveryNoteTarget && (
                <div className="fixed inset-0 z-[110] bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-white rounded-[3rem] shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95 duration-200 border border-white/20">
                        <div className="p-8 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                            <div>
                                <h3 className="font-black text-slate-900 uppercase tracking-tighter text-xl">Seal Delivery Certificate</h3>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Order Ref: {deliveryNoteTarget.id}</p>
                            </div>
                            <button onClick={() => setShowDeliveryModal(false)} className="p-2 hover:bg-slate-200 rounded-full text-slate-400 transition-colors"><X size={24}/></button>
                        </div>
                        
                        <div className="p-10 space-y-8 overflow-y-auto max-h-[70vh] custom-scrollbar">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                <div>
                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Recipient Legal Name</label>
                                    <input 
                                        type="text" 
                                        className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl text-base font-black outline-none focus:ring-4 focus:ring-blue-500/5 transition-all"
                                        value={recipientName}
                                        onChange={e => setRecipientName(e.target.value)}
                                        placeholder="Who is signing?"
                                    />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Recipient Phone (Optional)</label>
                                    <input
                                        type="tel"
                                        className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl text-base font-black outline-none focus:ring-4 focus:ring-blue-500/5 transition-all"
                                        value={recipientPhone}
                                        onChange={e => setRecipientPhone(e.target.value)}
                                        placeholder={`${getPlaceholder.phone().split(' ')[0]}...`}
                                    />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Exact Date & Time Received</label>
                                    <input 
                                        type="datetime-local" 
                                        className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl text-base font-black outline-none focus:ring-4 focus:ring-blue-500/5 transition-all"
                                        value={manualTimestamp}
                                        onChange={e => setManualTimestamp(e.target.value)}
                                    />
                                </div>
                            </div>

                            <div>
                                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2"><Globe size={14} className="text-blue-500"/> Tracking Coordinates (Handheld Sync)</h4>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="relative">
                                        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[9px] font-black text-slate-400 uppercase">Lat</div>
                                        <input 
                                            type="number" 
                                            className="w-full pl-12 p-3 bg-slate-50 border border-slate-200 rounded-2xl font-mono font-bold outline-none focus:ring-4 focus:ring-blue-500/5"
                                            value={manualGps.lat}
                                            onChange={e => setManualGps({...manualGps, lat: e.target.value})}
                                            placeholder="-13.9..."
                                        />
                                    </div>
                                    <div className="relative">
                                        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[9px] font-black text-slate-400 uppercase">Lng</div>
                                        <input 
                                            type="number" 
                                            className="w-full pl-12 p-3 bg-slate-50 border border-slate-200 rounded-2xl font-mono font-bold outline-none focus:ring-4 focus:ring-blue-500/5"
                                            value={manualGps.lng}
                                            onChange={e => setManualGps({...manualGps, lng: e.target.value})}
                                            placeholder="33.7..."
                                        />
                                    </div>
                                </div>
                                <p className="text-[9px] text-slate-400 mt-2 font-bold uppercase tracking-tight italic flex items-center gap-1"><Info size={10}/> Auto GPS when available, manual coordinates accepted</p>
                            </div>

                            <div>
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Comments / Remarks</label>
                                <textarea 
                                    className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm h-24 resize-none outline-none focus:ring-4 focus:ring-blue-500/5 transition-all"
                                    value={deliveryNotesText}
                                    onChange={e => setDeliveryNotesText(e.target.value)}
                                    placeholder="Dispatch or recipient comments..."
                                />
                            </div>

                            <div>
                                <div className="flex items-center justify-between mb-3">
                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Customer Signature</label>
                                    <div className="bg-slate-100 rounded-xl p-1 border border-slate-200 flex items-center gap-1">
                                        {(['Draw', 'Upload'] as SignatureInputMode[]).map(mode => (
                                            <button
                                                key={mode}
                                                onClick={() => setSignatureInputMode(mode)}
                                                className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all ${signatureInputMode === mode ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                                            >
                                                {mode}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {signatureInputMode === 'Draw' ? (
                                    <div className="relative group">
                                        <canvas
                                            ref={canvasRef}
                                            onPointerDown={startDrawing}
                                            onPointerMove={draw}
                                            onPointerUp={stopDrawing}
                                            onPointerLeave={stopDrawing}
                                            onPointerCancel={stopDrawing}
                                            className="w-full h-48 bg-white border-2 border-slate-200 rounded-3xl cursor-crosshair touch-none shadow-inner"
                                        />
                                        <button
                                            onClick={clearSignature}
                                            className="absolute top-4 right-4 p-2 bg-slate-100 hover:bg-rose-100 text-slate-400 hover:text-rose-600 rounded-xl transition-all border border-slate-200"
                                            title="Clear Signature"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                        <div className="absolute bottom-4 left-4 flex items-center gap-2 text-[8px] font-bold text-slate-300 uppercase tracking-widest pointer-events-none">
                                            <ShieldCheck size={10} /> Desktop pointer signature pad ready
                                        </div>
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        <input
                                            ref={signatureUploadInputRef}
                                            data-testid="signature-upload-input"
                                            type="file"
                                            accept="image/png,image/jpeg,image/jpg,image/webp"
                                            className="hidden"
                                            onChange={handleSignatureUpload}
                                        />
                                        <button
                                            onClick={() => signatureUploadInputRef.current?.click()}
                                            className="w-full py-3 rounded-2xl border border-slate-200 bg-slate-50 text-slate-700 text-[10px] font-black uppercase tracking-widest hover:bg-slate-100 flex items-center justify-center gap-2"
                                        >
                                            <Upload size={14} /> Upload Signature
                                        </button>
                                        <div className="border-2 border-dashed border-slate-200 rounded-2xl p-4 min-h-28 bg-white flex items-center justify-center">
                                            {uploadedSignatureDataUrl ? (
                                                <img src={uploadedSignatureDataUrl} alt="Uploaded recipient signature" className="max-h-24 object-contain" />
                                            ) : (
                                                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">No uploaded signature</p>
                                            )}
                                        </div>
                                        {uploadedSignatureDataUrl && (
                                            <button
                                                onClick={clearSignature}
                                                className="text-[10px] font-black text-rose-600 uppercase tracking-wider hover:underline"
                                            >
                                                Clear Uploaded Signature
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>

                            <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-100">
                                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200">
                                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Driver In-Charge</p>
                                    <p className="text-xs font-bold text-slate-700">{deliveryTarget.driverName || 'N/A'}</p>
                                </div>
                                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200">
                                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Vehicle Reg No.</p>
                                    <p className="text-xs font-bold text-slate-700">{deliveryTarget.vehicleNo || 'N/A'}</p>
                                </div>
                            </div>

                            <button 
                                onClick={handleCaptureDelivery} 
                                disabled={!canFinalizeDelivery}
                                className="w-full py-5 bg-blue-600 text-white rounded-3xl font-black uppercase text-sm tracking-[0.2em] shadow-2xl shadow-blue-500/30 hover:bg-blue-700 transition-all active:scale-95 flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <CheckSquare size={24}/> {isSavingDelivery ? 'Finalizing...' : 'Finalize & Generate Certificate'}
                            </button>
                        </div>

                        <div className="px-10 py-6 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
                            <span className="flex items-center gap-2 text-[9px] font-black text-slate-400 uppercase tracking-widest">
                                <ShieldCheck size={14} className="text-emerald-500"/> Protocol Verified
                            </span>
                            <span className="text-[9px] font-mono text-slate-400 uppercase tracking-tighter">Office Terminal Sync</span>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
};

export default ShippingManager;
