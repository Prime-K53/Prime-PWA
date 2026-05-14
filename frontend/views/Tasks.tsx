import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { 
  CheckSquare, Plus, Trash2, Clock, User, Search, Filter, 
  CheckCircle, AlertCircle, Circle, Briefcase, FileText, 
  X, AlignLeft, Calendar, Flag, Save, MoreVertical, Edit2,
  RefreshCw, ChevronRight, UserPlus, Info, Play, Bell
} from 'lucide-react';
import { useData } from '../context/DataContext';
import { CRMTask } from '../types';
import { OfflineImage } from '../components/OfflineImage';

const Tasks: React.FC = () => {
  const { tasks, addTask, updateTask, deleteTask, user, allUsers, notify } = useData();
  const location = useLocation();
  const [viewMode, setViewMode] = useState<'Board' | 'List'>('Board');
  const [filter, setFilter] = useState<'All' | 'My Tasks'>('All');
  const [searchTerm, setSearchTerm] = useState('');
  
  // Modal State
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [editingTask, setEditingTask] = useState<CRMTask | null>(null);

  // Handle direct creation from navigation state
  useEffect(() => {
    if (location.state && (location.state as any).action === 'create') {
      handleOpenNewTask();
    }
  }, [location.state]);

  // Form State
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDescription, setTaskDescription] = useState('');
  const [taskDate, setTaskDate] = useState(new Date().toISOString().split('T')[0]);
  const [taskPriority, setTaskPriority] = useState<CRMTask['priority']>('Medium');
  const [taskAssignee, setTaskAssignee] = useState(user?.id || '');
  const [hasReminder, setHasReminder] = useState(false);
  const [reminderTime, setReminderTime] = useState('');

  // Animation State
  const [completingId, setCompletingId] = useState<string | null>(null);

  // Context Menu State
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState<{x: number, y: number} | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpenMenuId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredTasks = useMemo(() => {
      return tasks.filter(t => {
          const matchesFilter = filter === 'My Tasks' ? t.assignedTo === user?.id : true;
          const matchesSearch = t.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
                              (t.notes || '').toLowerCase().includes(searchTerm.toLowerCase());
          return matchesFilter && matchesSearch;
      });
  }, [tasks, filter, user, searchTerm]);

  const handleOpenNewTask = () => {
      setEditingTask(null);
      setTaskTitle('');
      setTaskDescription('');
      setTaskPriority('Medium');
      setTaskDate(new Date().toISOString().split('T')[0]);
      setTaskAssignee(user?.id || '');
      setHasReminder(false);
      setReminderTime('');
      setShowTaskModal(true);
  };

  const handleEditTask = (task: CRMTask) => {
      setEditingTask(task);
      setTaskTitle(task.title);
      setTaskDescription(task.notes || '');
      setTaskPriority(task.priority);
      setTaskDate(task.dueDate);
      setTaskAssignee(task.assignedTo);
      setHasReminder(task.hasAlarm);
      setReminderTime(task.reminderDate ? task.reminderDate.slice(0, 16) : '');
      setShowTaskModal(true);
      setOpenMenuId(null);
  };

  const handleSaveTask = (e: React.FormEvent) => {
      e.preventDefault();
      if (!taskTitle.trim()) return;
      
      const taskData: Partial<CRMTask> = {
          title: taskTitle,
          status: editingTask?.status || 'Pending',
          priority: taskPriority,
          dueDate: taskDate,
          assignedTo: taskAssignee || user?.id || '',
          notes: taskDescription,
          hasAlarm: hasReminder,
          reminderDate: hasReminder ? reminderTime : undefined
      };

      if (editingTask) {
          updateTask({ ...editingTask, ...taskData } as CRMTask);
          notify("Task updated successfully", "success");
      } else {
          addTask({ ...taskData, id: '' } as CRMTask);
          notify("New task created", "success");
      }
      
      setShowTaskModal(false);
      setEditingTask(null);
  };

  const handleStatusUpdate = (task: CRMTask, status: CRMTask['status']) => {
      setOpenMenuId(null);
      if (status === 'Completed') {
          setCompletingId(task.id);
          setTimeout(() => {
              updateTask({ ...task, status });
              setCompletingId(null);
              notify(`Task marked as ${status}`, "info");
          }, 600);
      } else {
          updateTask({ ...task, status });
          notify(`Task marked as ${status}`, "info");
      }
  };

  const handleDeleteTask = (id: string) => {
      if (confirm("Are you sure you want to delete this task?")) {
          deleteTask(id);
          setOpenMenuId(null);
          notify("Task deleted", "info");
      }
  };

  const handleDragStart = (e: React.DragEvent, id: string) => {
      e.dataTransfer.setData('text/plain', id);
  };

  const handleDragOver = (e: React.DragEvent) => e.preventDefault();

  const handleDrop = (e: React.DragEvent, status: CRMTask['status']) => {
      e.preventDefault();
      const id = e.dataTransfer.getData('text/plain');
      const task = tasks.find(t => t.id === id);
      if (task && task.status !== status) {
          if (status === 'Completed') {
              setCompletingId(task.id);
              setTimeout(() => {
                  updateTask({ ...task, status });
                  setCompletingId(null);
              }, 600);
          } else {
              updateTask({ ...task, status });
          }
      }
  };

  const handleContextMenu = (e: React.MouseEvent, id: string) => {
      e.preventDefault();
      e.stopPropagation();
      const x = Math.min(e.clientX, window.innerWidth - 220);
      const y = Math.min(e.clientY, window.innerHeight - 250);
      setMenuPos({ x, y });
      setOpenMenuId(id);
  };

  const getPriorityColor = (p: string) => {
      switch(p) {
          case 'Urgent': return 'bg-purple-100 text-purple-700 border-purple-200';
          case 'High': return 'bg-red-100 text-red-700 border-red-200';
          case 'Medium': return 'bg-amber-100 text-amber-700 border-amber-200';
          default: return 'bg-blue-100 text-blue-700 border-blue-200';
      }
  };

  const TaskCard: React.FC<{ task: CRMTask }> = ({ task }) => {
      const assignedUser = allUsers.find(u => u.id === task.assignedTo);
      const isOverdue = new Date(task.dueDate) < new Date() && task.status !== 'Completed';
      
      return (
        <div 
            draggable 
            onDragStart={(e) => handleDragStart(e, task.id)}
            onContextMenu={(e) => handleContextMenu(e, task.id)}
            className={`bg-white p-4 rounded-xl shadow-sm border hover:shadow-md transition-all cursor-grab active:cursor-grabbing group relative
                ${openMenuId === task.id ? 'border-blue-400 ring-2 ring-blue-500/10' : 'border-slate-200'}
                ${task.status === 'Completed' ? 'bg-emerald-50/20' : ''}
            `}
        >
            <div className="flex justify-between items-start mb-2">
                <div className="flex items-center gap-1.5">
                    {task.status === 'Completed' ? (
                        <CheckCircle size={14} className="text-emerald-500 animate-check-pop" />
                    ) : completingId === task.id ? (
                        <div className="w-3.5 h-3.5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
                    ) : (
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border uppercase tracking-wider ${getPriorityColor(task.priority)}`}>{task.priority}</span>
                    )}
                    {task.hasAlarm && <Bell size={12} className="text-blue-500 animate-pulse"/>}
                </div>
                <button 
                    onClick={(e) => handleContextMenu(e, task.id)}
                    className={`p-1 rounded-lg transition-colors ${openMenuId === task.id ? 'text-blue-600 bg-blue-50' : 'text-slate-300 hover:text-slate-600 hover:bg-slate-100'}`}
                >
                    <MoreVertical size={14}/>
                </button>
            </div>
            <h4 className={`font-bold text-slate-800 mb-1 text-sm leading-tight group-hover:text-blue-600 transition-colors ${task.status === 'Completed' ? 'line-through opacity-50' : ''}`}>{task.title}</h4>
            {task.notes && (
                <p className="text-xs text-slate-500 mb-3 line-clamp-2 leading-relaxed">{task.notes}</p>
            )}
            
            {task.relatedTo && (
                <div className="text-[10px] text-slate-500 mb-3 flex items-center gap-1.5 bg-slate-50 px-2 py-1 rounded-lg border border-slate-100 w-fit">
                    {task.relatedTo.type === 'WorkOrder' ? <Briefcase size={10}/> : <User size={10}/>}
                    <span className="truncate max-w-[150px] font-medium">{task.relatedTo.name}</span>
                </div>
            )}
            
            <div className="flex justify-between items-center text-xs text-slate-400 border-t border-slate-100 pt-3 mt-1">
                <span className={`flex items-center gap-1.5 ${isOverdue ? 'text-red-500 font-bold' : ''}`}>
                    <Clock size={12}/> {new Date(task.dueDate).toLocaleDateString()}
                </span>
                <div className="flex items-center gap-2" title={`Assigned to: ${assignedUser?.name || 'Unassigned'}`}>
                    <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 font-bold border border-white shadow-sm text-[10px] overflow-hidden">
                        <OfflineImage 
                            src={assignedUser?.avatar} 
                            alt={assignedUser?.name || '?'} 
                            className="w-full h-full object-cover"
                            fallback={assignedUser?.name?.charAt(0) || '?'}
                        />
                    </div>
                </div>
            </div>
        </div>
      );
  };

  const KanbanColumn = ({ status, title }: { status: CRMTask['status'], title: string }) => {
      const columnTasks = filteredTasks.filter(t => t.status === status);
      return (
          <div 
            className="flex-1 min-w-[300px] bg-slate-50/50 rounded-2xl border border-slate-200/60 flex flex-col h-full overflow-hidden"
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, status)}
          >
              <div className="p-4 border-b border-slate-200/60 flex justify-between items-center bg-slate-100/50">
                  <h3 className="font-bold text-slate-700 text-sm flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${status === 'Pending' ? 'bg-slate-400' : status === 'In Progress' ? 'bg-blue-500' : 'bg-emerald-500'}`}></div>
                      {title}
                  </h3>
                  <span className="bg-white px-2 py-0.5 rounded-md text-xs text-slate-500 font-bold border border-slate-200 shadow-sm">{columnTasks.length}</span>
              </div>
              <div className="p-3 flex-1 overflow-y-auto space-y-3 custom-scrollbar">
                  {columnTasks.map(task => <TaskCard key={task.id} task={task} />)}
                  {columnTasks.length === 0 && (
                      <div className="h-32 border-2 border-dashed border-slate-200 rounded-xl flex flex-col items-center justify-center text-slate-400 text-xs opacity-50">
                          <CheckCircle size={24} className="mb-2 opacity-20"/>
                          No tasks in {title}
                      </div>
                  )}
              </div>
          </div>
      );
  };

  const renderContextMenu = () => {
    if (!openMenuId || !menuPos) return null;
    const task = tasks.find(t => t.id === openMenuId);
    if (!task) return null;

    return (
        <div 
            ref={menuRef}
            className="fixed w-52 bg-white/95 backdrop-blur-xl rounded-xl shadow-premium border border-slate-200 z-[100] animate-in fade-in zoom-in-95 duration-100 flex flex-col py-1.5"
            style={{ top: menuPos.y, left: menuPos.x }}
        >
            <div className="px-3 py-1 mb-1 border-b border-slate-100">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Task Options</p>
            </div>
            
            <button onClick={() => handleEditTask(task)} className="w-full text-left px-4 py-2 text-xs font-bold text-slate-700 hover:bg-blue-50 hover:text-blue-600 flex items-center gap-3 transition-colors">
                <Edit2 size={14}/> Edit Details
            </button>

            {task.status !== 'Completed' ? (
                <button onClick={() => handleStatusUpdate(task, 'Completed')} className="w-full text-left px-4 py-2 text-xs font-medium text-emerald-700 hover:bg-emerald-50 flex items-center gap-3 transition-colors">
                    <CheckCircle size={14}/> Mark as Done
                </button>
            ) : (
                <button onClick={() => handleStatusUpdate(task, 'Pending')} className="w-full text-left px-4 py-2 text-xs font-medium text-amber-700 hover:bg-amber-50 flex items-center gap-3 transition-colors">
                    <RefreshCw size={14}/> Set to Pending
                </button>
            )}

            {task.status === 'Pending' && (
                <button onClick={() => handleStatusUpdate(task, 'In Progress')} className="w-full text-left px-4 py-2 text-xs font-medium text-blue-700 hover:bg-blue-50 flex items-center gap-3 transition-colors">
                    <Play size={14}/> Start Progress
                </button>
            )}

            <div className="h-px bg-slate-100 my-1"></div>
            
            <button onClick={() => handleDeleteTask(task.id)} className="w-full text-left px-4 py-2 text-xs font-medium text-rose-600 hover:bg-rose-50 flex items-center gap-3 transition-colors">
                <Trash2 size={14}/> Delete Task
            </button>
        </div>
    );
  };

  return (
    <div className="p-6 max-w-[1600px] mx-auto h-[calc(100vh-4rem)] flex flex-col relative overflow-hidden">
        
        {renderContextMenu()}

        {/* Task Form Modal */}
        {showTaskModal && (
            <div className="fixed inset-0 z-[110] bg-slate-900/60 flex items-center justify-center p-4 backdrop-blur-sm">
                <div className="bg-white rounded-2xl shadow-premium w-full max-w-lg overflow-hidden animate-in zoom-in-95 border border-white/40">
                    <div className="p-5 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                        <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                            {editingTask ? <Edit2 className="text-blue-600" size={20}/> : <CheckSquare className="text-blue-600" size={20}/>}
                            {editingTask ? 'Edit Task' : 'New Task'}
                        </h2>
                        <button onClick={() => setShowTaskModal(false)} className="text-slate-400 hover:text-slate-600 transition-colors p-1 rounded-full hover:bg-slate-200">
                            <X size={20}/>
                        </button>
                    </div>
                    <form onSubmit={handleSaveTask} className="p-6 space-y-5 overflow-y-auto max-h-[70vh] custom-scrollbar">
                        <div>
                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Task Title</label>
                            <input 
                                type="text" 
                                className="w-full p-3 border border-slate-200 rounded-xl text-sm focus:ring-4 focus:ring-blue-500/5 outline-none font-bold text-slate-800 shadow-sm" 
                                placeholder="What needs to be done?"
                                value={taskTitle}
                                onChange={e => setTaskTitle(e.target.value)}
                                autoFocus
                            />
                        </div>
                        
                        <div>
                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 flex items-center gap-2">
                                <AlignLeft size={14}/> Description
                            </label>
                            <textarea 
                                className="w-full p-3 border border-slate-200 rounded-xl text-sm focus:ring-4 focus:ring-blue-500/5 outline-none h-24 resize-none shadow-sm"
                                placeholder="Add details, notes, or checklist..."
                                value={taskDescription}
                                onChange={e => setTaskDescription(e.target.value)}
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 flex items-center gap-2">
                                    <Calendar size={14}/> Due Date
                                </label>
                                <input 
                                    type="date"
                                    className="w-full p-2.5 border border-slate-200 rounded-xl text-sm focus:ring-4 focus:ring-blue-500/5 outline-none font-medium shadow-sm"
                                    value={taskDate}
                                    onChange={e => setTaskDate(e.target.value)}
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 flex items-center gap-2">
                                    <Flag size={14}/> Priority
                                </label>
                                <select
                                    className="w-full p-2.5 border border-slate-200 rounded-xl text-sm bg-white focus:ring-4 focus:ring-blue-500/5 outline-none font-bold text-slate-700 shadow-sm"
                                    value={taskPriority}
                                    onChange={e => setTaskPriority(e.target.value as any)}
                                >
                                    <option value="Low">Low Priority</option>
                                    <option value="Medium">Medium Priority</option>
                                    <option value="High">High Priority</option>
                                    <option value="Urgent">Urgent</option>
                                </select>
                            </div>
                        </div>

                        <div className="p-4 bg-blue-50/50 rounded-2xl border border-blue-100 space-y-3">
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input 
                                    type="checkbox" 
                                    className="w-4 h-4 rounded text-blue-600" 
                                    checked={hasReminder} 
                                    onChange={e => setHasReminder(e.target.checked)}
                                />
                                <span className="text-[10px] font-black text-blue-900 uppercase tracking-widest flex items-center gap-1.5">
                                    <Bell size={12}/> Set Reminder Alert
                                </span>
                            </label>
                            {hasReminder && (
                                <div className="animate-in slide-in-from-top-1">
                                    <label className="block text-[8px] font-black text-blue-400 uppercase tracking-widest mb-1 ml-1">Notify Me On</label>
                                    <input 
                                        type="datetime-local"
                                        className="w-full p-2.5 bg-white border border-blue-100 rounded-xl text-xs focus:ring-4 focus:ring-blue-500/5 outline-none font-bold shadow-sm"
                                        value={reminderTime}
                                        onChange={e => setReminderTime(e.target.value)}
                                    />
                                </div>
                            )}
                        </div>

                        <div>
                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 flex items-center gap-2">
                                <User size={14}/> Assign To
                            </label>
                            <select
                                className="w-full p-2.5 border border-slate-200 rounded-xl text-sm bg-white focus:ring-4 focus:ring-blue-500/5 outline-none font-bold text-slate-700 shadow-sm"
                                value={taskAssignee}
                                onChange={e => setTaskAssignee(e.target.value)}
                            >
                                {allUsers.map(u => (
                                    <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
                                ))}
                            </select>
                        </div>

                        <button 
                            type="submit" 
                            disabled={!taskTitle}
                            className="w-full py-3.5 bg-blue-600 text-white rounded-2xl font-black uppercase text-[11px] tracking-[0.2em] hover:bg-blue-700 shadow-xl shadow-blue-500/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:grayscale mt-2 active:scale-95"
                        >
                            <Save size={16}/> {editingTask ? 'Update Task' : 'Create Task'}
                        </button>
                    </form>
                </div>
            </div>
        )}

        {/* Toolbar */}
        <div className="mb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shrink-0">
            <div>
                <h1 className="text-[22px] font-bold text-slate-900 flex items-center gap-3 tracking-tight">
                    <CheckSquare className="text-blue-600" size={28}/> Task Manager
                </h1>
                <p className="text-sm text-slate-500 mt-1 font-medium">Collaborate and track team activities across the system</p>
            </div>
            
            <div className="flex flex-wrap gap-3 w-full md:w-auto">
                <div className="relative group flex-1 md:flex-none">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14}/>
                    <input 
                        type="text" 
                        placeholder="Search tasks..." 
                        className="pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs w-full md:w-64 outline-none focus:ring-4 focus:ring-blue-500/5 shadow-sm transition-all"
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                    />
                </div>

                <div className="flex bg-white/70 backdrop-blur-md p-1 rounded-xl border border-slate-200 shadow-sm">
                    <button onClick={() => setFilter('All')} className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${filter === 'All' ? 'bg-slate-800 text-white shadow-md' : 'text-slate-500 hover:text-slate-800'}`}>All</button>
                    <button onClick={() => setFilter('My Tasks')} className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${filter === 'My Tasks' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-800'}`}>My Tasks</button>
                </div>
                
                <button 
                    onClick={handleOpenNewTask} 
                    className="bg-blue-600 text-white px-5 py-2 rounded-xl text-xs font-black uppercase tracking-widest flex items-center gap-2 hover:bg-blue-700 shadow-lg shadow-blue-500/20 transition-all active:scale-95"
                >
                    <Plus size={16}/> New Task
                </button>
            </div>
        </div>

        {/* Informational Strip */}
        <div className="mb-6 flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] px-2">
            <Info size={12} className="text-blue-500"/>
            Tip: Set reminders to get desktop alerts for critical deadlines.
        </div>

        {viewMode === 'Board' && (
            <div className="flex-1 flex gap-6 overflow-x-auto pb-6 custom-scrollbar min-h-0">
                <KanbanColumn status="Pending" title="Ready to Start" />
                <KanbanColumn status="In Progress" title="In Progress" />
                <KanbanColumn status="Completed" title="Finalized" />
            </div>
        )}
    </div>
  );
};

export default Tasks;
