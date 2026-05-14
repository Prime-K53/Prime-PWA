import React, { useState, useMemo, useEffect } from 'react';
import { CalendarClock, AlertCircle, ChevronLeft, ChevronRight, Clock, GripVertical, Trash2, Lock, Zap } from 'lucide-react';
import { useData } from '../../context/DataContext';
import { WorkOrder, ResourceAllocation } from '../../types';

const Scheduler: React.FC = () => {
  const { 
    workOrders = [], 
    workCenters = [], 
    resources = [], 
    allocations = [], 
    allocateResource, 
    moveAllocation, 
    removeAllocation, 
    updateWorkOrderStatus 
  } = useData();
  
  // Date Control
  const [currentDate, setCurrentDate] = useState(new Date());
  
  const handleDateChange = (days: number) => {
      const newDate = new Date(currentDate);
      newDate.setDate(newDate.getDate() + days);
      setCurrentDate(newDate);
  };

  // Timeline Settings
  const startHour = 8; // 8 AM
  const endHour = 18; // 6 PM
  const totalHours = endHour - startHour;
  const pixelsPerHour = 100; // Width of one hour block

  // Drag State
  const [draggedItem, setDraggedItem] = useState<{ type: 'new' | 'existing', id: string, duration?: number } | null>(null);

  // Filter Work Orders
  const activeOrders = useMemo(() => {
      return workOrders.filter(wo => wo.status !== 'Completed' && wo.status !== 'Cancelled');
  }, [workOrders]);

  const unallocatedOrders = useMemo(() => {
      return activeOrders.filter(wo => !allocations.some(a => a.workOrderId === wo.id));
  }, [activeOrders, allocations]);

  // Helpers
  const getPositionFromTime = (timeString: string) => {
      const date = new Date(timeString);
      const hours = date.getHours() + (date.getMinutes() / 60);
      return (hours - startHour) * pixelsPerHour;
  };

  const getTimeFromPosition = (pixels: number) => {
      const hours = (pixels / pixelsPerHour) + startHour;
      const date = new Date(currentDate);
      date.setHours(Math.floor(hours), (hours % 1) * 60, 0, 0);
      return date;
  };

  // Handlers
  const handleDragStart = (e: React.DragEvent, type: 'new' | 'existing', id: string, duration: number = 1) => {
      setDraggedItem({ type, id, duration });
      e.dataTransfer.effectAllowed = 'move';
      // Set ghost image if needed
  };

  const handleDrop = (e: React.DragEvent, resourceId: string) => {
      e.preventDefault();
      if (!draggedItem) return;

      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      
      // Snap to 15 min grid (25px)
      const snappedX = Math.round(x / 25) * 25;
      
      const newStartTime = getTimeFromPosition(snappedX);
      const newEndTime = new Date(newStartTime.getTime() + (draggedItem.duration || 1) * 60 * 60 * 1000);

      if (draggedItem.type === 'new') {
          allocateResource({
              id: '',
              resourceId,
              workOrderId: draggedItem.id,
              startTime: newStartTime.toISOString(),
              endTime: newEndTime.toISOString(),
              status: 'Scheduled'
          } as any);
          // Update WO status if needed
          updateWorkOrderStatus(draggedItem.id, 'Scheduled');
      } else {
          moveAllocation(draggedItem.id, newStartTime.toISOString(), newEndTime.toISOString(), resourceId);
      }
      setDraggedItem(null);
  };

  const handleDragOver = (e: React.DragEvent) => {
      e.preventDefault();
  };

  return (
    <div className="p-6 max-w-[1600px] mx-auto space-y-6 h-[calc(100vh-4rem)] flex flex-col">
        
        <div className="flex justify-between items-center shrink-0 mb-4">
            <div>
               <h1 className="text-lg font-bold text-slate-800 flex items-center gap-2"><CalendarClock size={18} className="text-blue-600"/> Production Schedule</h1>
               <p className="text-xs text-slate-500 mt-0.5">Drag work orders to assign resources</p>
            </div>
            
            <div className="flex items-center gap-2 bg-white p-1 rounded-xl border border-slate-200 shadow-sm">
                <button onClick={() => handleDateChange(-1)} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500"><ChevronLeft size={16}/></button>
                <div className="text-center min-w-[120px]">
                    <div className="font-bold text-slate-800 text-sm">{currentDate.toLocaleDateString(undefined, { weekday: 'long' })}</div>
                    <div className="text-[10px] text-slate-500">{currentDate.toLocaleDateString()}</div>
                </div>
                <button onClick={() => handleDateChange(1)} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500"><ChevronRight size={16}/></button>
            </div>
        </div>

        <div className="flex-1 flex gap-6 overflow-hidden">
            {/* Unscheduled Queue */}
            <div className="w-64 bg-white border border-slate-200 rounded-xl flex flex-col shrink-0">
                <div className="p-3 border-b border-slate-200 bg-slate-50 rounded-t-xl">
                    <h3 className="font-bold text-slate-700 flex items-center gap-2 text-xs uppercase tracking-wider"><AlertCircle size={14}/> Queue ({unallocatedOrders.length})</h3>
                </div>
                <div className="flex-1 overflow-y-auto p-3 space-y-3">
                    {unallocatedOrders.map(wo => (
                        <div 
                            key={wo.id}
                            draggable
                            onDragStart={(e) => handleDragStart(e, 'new', wo.id, Math.max(1, wo.quantityPlanned / 50))} // Est duration
                            className={`bg-white border p-3 rounded-lg shadow-sm cursor-grab active:cursor-grabbing hover:shadow-md transition-all group
                                ${wo.isConfidential ? 'border-red-200 bg-red-50/50' : 'border-slate-200'}
                            `}
                        >
                            <div className="flex justify-between items-start mb-1">
                                <div className="flex items-center gap-1">
                                    <span className="text-[10px] font-mono text-slate-500">{wo.id}</span>
                                    {wo.isConfidential && <Lock size={10} className="text-red-500"/>}
                                </div>
                                <GripVertical size={12} className="text-slate-300"/>
                            </div>
                            <div className="font-bold text-xs text-slate-800 mb-1 flex items-center gap-1">
                                {wo.productName}
                            </div>
                            <div className="text-[10px] text-slate-500 flex justify-between">
                                <span>{wo.quantityPlanned} units</span>
                                <span>Due: {new Date(wo.dueDate).toLocaleDateString(undefined, {month:'short', day:'numeric'})}</span>
                            </div>
                        </div>
                    ))}
                    {unallocatedOrders.length === 0 && (
                        <div className="text-center text-slate-400 text-xs py-10">All orders assigned.</div>
                    )}
                </div>
            </div>

            {/* Timeline */}
            <div className="flex-1 bg-white border border-slate-200 rounded-xl flex flex-col overflow-hidden">
                {/* Time Header */}
                <div className="flex border-b border-slate-200 bg-slate-50 h-10 shrink-0">
                    <div className="w-48 border-r border-slate-200 p-2 font-bold text-slate-700 text-xs flex items-center pl-4">Resource</div>
                    <div className="flex-1 relative overflow-hidden">
                        {Array.from({ length: totalHours }).map((_, i) => (
                            <div 
                                key={i} 
                                className="absolute border-l border-slate-200 h-full flex items-center pl-1 text-[10px] font-medium text-slate-500"
                                style={{ left: i * pixelsPerHour, width: pixelsPerHour }}
                            >
                                {startHour + i}:00
                            </div>
                        ))}
                    </div>
                </div>

                {/* Resource Rows */}
                <div className="flex-1 overflow-y-auto">
                    {resources.map(res => {
                        // Get allocations for this resource on current date
                        const resAllocations = allocations.filter(a => 
                            a.resourceId === res.id && 
                            new Date(a.startTime).toDateString() === currentDate.toDateString()
                        );

                        return (
                            <div key={res.id} className="flex border-b border-slate-100 h-20">
                                {/* Resource Label */}
                                <div className="w-48 border-r border-slate-200 p-3 bg-slate-50 flex flex-col justify-center shrink-0">
                                    <div className="font-bold text-xs text-slate-800">{res.name}</div>
                                    <div className="text-[10px] text-slate-500">{workCenters.find(wc => wc.id === res.workCenterId)?.name}</div>
                                </div>

                                {/* Timeline Track */}
                                <div 
                                    className="flex-1 relative bg-slate-50 min-w-[1000px]"
                                    onDragOver={handleDragOver}
                                    onDrop={(e) => handleDrop(e, res.id)}
                                >
                                    {/* Hour Grid Lines */}
                                    {Array.from({ length: totalHours }).map((_, i) => (
                                        <div 
                                            key={i} 
                                            className="absolute border-l border-slate-100 h-full pointer-events-none"
                                            style={{ left: i * pixelsPerHour }}
                                        ></div>
                                    ))}

                                    {/* Allocated Blocks */}
                                    {resAllocations.map(alloc => {
                                        const wo = workOrders.find(w => w.id === alloc.workOrderId);
                                        if (!wo) return null;
                                        
                                        const left = getPositionFromTime(alloc.startTime);
                                        const width = (new Date(alloc.endTime).getTime() - new Date(alloc.startTime).getTime()) / (1000 * 60 * 60) * pixelsPerHour;

                                        // Priority Styling
                                        const isUrgent = wo.customerName?.toLowerCase().includes('urgent') || wo.isConfidential; // Mock logic if priority not available on WO directly in this context
                                        
                                        return (
                                            <div
                                                key={alloc.id}
                                                draggable
                                                onDragStart={(e) => handleDragStart(e, 'existing', alloc.id, width/pixelsPerHour)}
                                                className={`absolute top-2 bottom-2 rounded-lg shadow-sm cursor-grab active:cursor-grabbing flex flex-col justify-center px-2 overflow-hidden hover:z-10 group
                                                    ${wo.isConfidential ? 'border-2 border-red-400' : 'border border-white/20'}
                                                `}
                                                style={{ 
                                                    left: Math.max(0, left), 
                                                    width,
                                                    backgroundColor: wo.status === 'In Progress' ? '#3b82f6' : '#8b5cf6',
                                                    color: 'white'
                                                }}
                                            >
                                                <div className="flex items-center gap-1 font-bold text-[10px] truncate">
                                                    {wo.isConfidential && <Lock size={10} className="shrink-0 text-red-200"/>}
                                                    <span className="truncate">{wo.productName}</span>
                                                </div>
                                                <div className="text-[9px] opacity-90 flex items-center gap-1">
                                                    <Clock size={8}/> {new Date(alloc.startTime).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}
                                                </div>
                                                <button 
                                                    onClick={(e) => { e.stopPropagation(); removeAllocation(alloc.id); }}
                                                    className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 p-0.5 hover:bg-black/20 rounded"
                                                >
                                                    <Trash2 size={10} color="white"/>
                                                </button>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    </div>
  );
};

export default Scheduler;
