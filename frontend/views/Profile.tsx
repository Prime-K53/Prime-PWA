
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { 
  User as UserIcon, Mail, Shield, Key, Clock, Activity, History, ArrowLeft, Save, Eye, EyeOff, 
  CheckCircle2, AlertCircle, Camera, Edit2, X, Check, Globe, Phone, Briefcase, Trash2, 
  ChevronRight, Upload, Loader2, Image as ImageIcon
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Dialog from '../components/Dialog';
import { cloudDb } from '../services/cloudDb';

const TIMEZONES = [
  { label: 'UTC (GMT)', value: 'UTC' },
  { label: 'Africa/Blantyre (Malawi)', value: 'Africa/Blantyre' },
  { label: 'Africa/Johannesburg', value: 'Africa/Johannesburg' },
  { label: 'Africa/Nairobi', value: 'Africa/Nairobi' },
  { label: 'Europe/London', value: 'Europe/London' },
  { label: 'America/New_York', value: 'America/New_York' },
  { label: 'Asia/Dubai', value: 'Asia/Dubai' },
];

const PREDEFINED_AVATARS = [
  'https://ui-avatars.com/api/?name=Admin&background=0D8ABC&color=fff',
  'https://ui-avatars.com/api/?name=User&background=6366f1&color=fff',
  'https://ui-avatars.com/api/?name=Staff&background=10b981&color=fff',
  'https://ui-avatars.com/api/?name=Manager&background=f59e0b&color=fff',
];

const Profile: React.FC = () => {
  const { user, allUsers, auditLogs, notify, manageUser, validatePasswordStrength } = useAuth();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Profile data state
  const [profileData, setProfileData] = useState({
    fullName: user?.fullName || user?.name || '',
    email: user?.email || '',
    phone: (user as any)?.phone || '',
    jobTitle: (user as any)?.jobTitle || '',
    timezone: (user as any)?.timezone || 'Africa/Blantyre',
    profilePhoto: (user as any)?.profilePhoto || '',
  });

  const [originalData, setOriginalData] = useState({ ...profileData });
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);

  // Password state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);
  
  // UI state
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const [showCropModal, setShowCropModal] = useState(false);
  const [tempImage, setTempImage] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0, width: 100, height: 100 });

  const myUser = allUsers.find((u: any) => u.id === user?.id || u.username === user?.username);

  // Sync state with user when it changes
  useEffect(() => {
    if (user) {
      const newData = {
        fullName: user.fullName || user.name || '',
        email: user.email || '',
        phone: (user as any).phone || '',
        jobTitle: (user as any).jobTitle || '',
        timezone: (user as any).timezone || 'Africa/Blantyre',
        profilePhoto: (user as any).profilePhoto || '',
      };
      setProfileData(newData);
      setOriginalData(newData);
    }
  }, [user]);

  const hasChanges = useMemo(() => {
    return JSON.stringify(profileData) !== JSON.stringify(originalData);
  }, [profileData, originalData]);

  const changedFields = useMemo(() => {
    const changes: string[] = [];
    if (profileData.fullName !== originalData.fullName) changes.push('Full Name');
    if (profileData.email !== originalData.email) changes.push('Email');
    if (profileData.phone !== originalData.phone) changes.push('Phone');
    if (profileData.jobTitle !== originalData.jobTitle) changes.push('Job Title');
    if (profileData.timezone !== originalData.timezone) changes.push('Timezone');
    if (profileData.profilePhoto !== originalData.profilePhoto) changes.push('Profile Photo');
    return changes;
  }, [profileData, originalData]);

  const validateName = (name: string) => {
    if (name.length < 2 || name.length > 50) return 'Name must be between 2 and 50 characters';
    if (/[!@#$%^&*(),.?":{}|<>]/.test(name)) return 'Special characters are not allowed';
    const duplicate = allUsers.find(u => 
      (u.fullName?.toLowerCase() === name.toLowerCase() || u.name?.toLowerCase() === name.toLowerCase()) && 
      u.id !== user?.id
    );
    if (duplicate) return 'This name is already in use within the organization';
    return null;
  };

  const handleNameSave = () => {
    const error = validateName(profileData.fullName);
    if (error) {
      setNameError(error);
      return;
    }
    setIsEditingName(false);
    setNameError(null);
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      notify('File size must be less than 5MB', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setTempImage(reader.result as string);
      setShowCropModal(true);
    };
    reader.readAsDataURL(file);
  };

  const handleCropSave = async () => {
    if (!tempImage) return;

    setUploading(true);
    try {
      // Basic image compression/resizing using Canvas
      const img = new Image();
      img.src = tempImage;
      await new Promise((resolve) => { img.onload = resolve; });

      const canvas = document.createElement('canvas');
      const size = Math.min(img.width, img.height, 400); // Max 400px
      canvas.width = size;
      canvas.height = size;
      
      const ctx = canvas.getContext('2d');
      if (ctx) {
        // Center crop
        const sourceSize = Math.min(img.width, img.height);
        const sourceX = (img.width - sourceSize) / 2;
        const sourceY = (img.height - sourceSize) / 2;
        
        ctx.drawImage(img, sourceX, sourceY, sourceSize, sourceSize, 0, 0, size, size);
        
        const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.8);
        setProfileData(prev => ({ ...prev, profilePhoto: compressedDataUrl }));
      }
      
      setShowCropModal(false);
      setTempImage(null);
      notify('Photo updated locally. Save changes to sync with cloud.', 'info');
    } catch (err) {
      notify('Failed to process image', 'error');
    } finally {
      setUploading(false);
    }
  };

  const handleBatchSave = async () => {
    setSaving(true);
    try {
      const updatedUser = {
        ...(myUser || user),
        ...profileData,
        fullName: profileData.fullName,
        name: profileData.fullName,
      };

      await manageUser(updatedUser as any);
      
      // If cloud mode is enabled, sync with profiles table
      if (cloudDb.isConfigured()) {
        await cloudDb.upsertProfile({
          ...updatedUser,
          user_id: user?.id,
          full_name: profileData.fullName,
        });
      }

      setOriginalData({ ...profileData });
      setShowSummaryModal(false);
      notify('Profile updated successfully', 'success');
    } catch (err) {
      console.error('Save failed:', err);
      notify('Failed to update profile', 'error');
    } finally {
      setSaving(false);
    }
  };

  const userLogs = useMemo(() => {
    return auditLogs
      .filter((log: any) => log.userId === user?.username)
      .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [auditLogs, user]);

  const stats = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    const todayLogs = userLogs.filter((l: any) => l.date.startsWith(today));
    return {
      total: userLogs.length,
      today: todayLogs.length,
      lastAction: userLogs[0]?.action || 'None'
    };
  }, [userLogs]);

  const passwordValidation = validatePasswordStrength(newPassword);

  const handleChangePassword = async () => {
    if (!newPassword) { notify('Enter a new password', 'error'); return; }
    if (newPassword !== confirmPassword) { notify('Passwords do not match', 'error'); return; }
    if (!passwordValidation.valid) { notify(passwordValidation.errors[0] || 'Password does not meet requirements', 'error'); return; }

    setSaving(true);
    try {
      await manageUser({ ...(myUser || user), password: newPassword } as any);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      notify('Password updated successfully', 'success');
    } catch {
      notify('Failed to update password', 'error');
    } finally {
      setSaving(false);
    }
  };

  const displayName = profileData.fullName || 'User';
  const initials = displayName.charAt(0).toUpperCase();
  const role = user?.role || 'User';
  const username = user?.username || '';

  return (
    <div className="h-full overflow-y-auto custom-scrollbar bg-slate-50/50">
      <div className="max-w-5xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => navigate(-1)} 
              className="p-2.5 hover:bg-white rounded-xl text-slate-500 transition-all border border-slate-200 bg-white shadow-sm hover:shadow-md active:scale-95" 
              title="Go back"
            >
              <ArrowLeft size={20} />
            </button>
            <div>
              <h1 className="text-2xl font-black text-slate-900 tracking-tight">Account Settings</h1>
              <p className="text-sm text-slate-500 mt-0.5 font-medium">Manage your personal information and preferences</p>
            </div>
          </div>

          {hasChanges && (
            <button
              onClick={() => setShowSummaryModal(true)}
              className="flex items-center justify-center gap-2 px-6 py-2.5 bg-indigo-600 text-white rounded-xl font-bold text-sm hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-500/20 active:scale-95 animate-in fade-in slide-in-from-right-4"
            >
              <Save size={18} />
              Save All Changes
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column - Profile Card */}
          <div className="lg:col-span-4 space-y-6">
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="h-24 bg-gradient-to-r from-indigo-500 to-purple-600" />
              <div className="px-6 pb-6 -mt-12 flex flex-col items-center text-center">
                {/* Profile Photo */}
                <div className="relative group">
                  <div className="w-24 h-24 rounded-full border-4 border-white bg-slate-100 shadow-xl overflow-hidden flex items-center justify-center text-slate-400">
                    {profileData.profilePhoto ? (
                      <img src={profileData.profilePhoto} alt={displayName} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-3xl font-black text-indigo-600">{initials}</span>
                    )}
                  </div>
                  <button 
                    onClick={() => fileInputRef.current?.click()}
                    className="absolute inset-0 bg-black/40 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Change photo"
                  >
                    <Camera size={24} />
                  </button>
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    className="hidden" 
                    accept="image/jpeg,image/png,image/webp"
                    onChange={handlePhotoUpload}
                  />
                </div>

                {/* Name & Role */}
                <div className="mt-4 w-full">
                  {isEditingName ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <input
                          autoFocus
                          value={profileData.fullName}
                          onChange={e => setProfileData(prev => ({ ...prev, fullName: e.target.value }))}
                          onKeyDown={e => {
                            if (e.key === 'Enter') handleNameSave();
                            if (e.key === 'Escape') { setIsEditingName(false); setNameError(null); setProfileData(prev => ({ ...prev, fullName: originalData.fullName })); }
                          }}
                          onBlur={() => {
                            // Discard changes on outside click if no error, otherwise stay in edit mode
                            if (!validateName(profileData.fullName)) {
                              setIsEditingName(false);
                              setNameError(null);
                            }
                          }}
                          className={`w-full text-center text-lg font-bold text-slate-900 bg-slate-50 border ${nameError ? 'border-rose-500' : 'border-indigo-500'} rounded-lg px-2 py-1 outline-none`}
                        />
                        <button onClick={handleNameSave} className="p-1 text-emerald-600 hover:bg-emerald-50 rounded"><Check size={18} /></button>
                        <button onClick={() => { setIsEditingName(false); setNameError(null); setProfileData(prev => ({ ...prev, fullName: originalData.fullName })); }} className="p-1 text-rose-600 hover:bg-rose-50 rounded"><X size={18} /></button>
                      </div>
                      {nameError && <p className="text-[10px] font-bold text-rose-500">{nameError}</p>}
                    </div>
                  ) : (
                    <div className="flex items-center justify-center gap-2 group">
                      <h2 className="text-xl font-black text-slate-900">{displayName}</h2>
                      {(user?.isSuperAdmin || user?.role === 'Admin') && (
                        <button 
                          onClick={() => setIsEditingName(true)}
                          className="p-1 text-slate-400 hover:text-indigo-600 opacity-0 group-hover:opacity-100 transition-all"
                        >
                          <Edit2 size={14} />
                        </button>
                      )}
                    </div>
                  )}
                  <p className="text-sm text-slate-500 font-medium">@{username}</p>
                </div>

                <div className="flex items-center gap-2 mt-4">
                  <span className="px-3 py-1 bg-indigo-50 text-indigo-600 rounded-full text-[10px] font-black uppercase tracking-wider border border-indigo-100">
                    {role}
                  </span>
                </div>

                {/* Photo Actions */}
                <div className="grid grid-cols-2 gap-2 w-full mt-6 pt-6 border-t border-slate-100">
                  <button 
                    onClick={() => fileInputRef.current?.click()}
                    className="flex flex-col items-center gap-1.5 p-2 rounded-xl hover:bg-slate-50 transition-colors text-slate-600"
                  >
                    <Upload size={16} className="text-indigo-500" />
                    <span className="text-[10px] font-bold uppercase tracking-tight">Upload</span>
                  </button>
                  <button 
                    onClick={() => setProfileData(prev => ({ ...prev, profilePhoto: '' }))}
                    className="flex flex-col items-center gap-1.5 p-2 rounded-xl hover:bg-slate-50 transition-colors text-slate-600"
                  >
                    <Trash2 size={16} className="text-rose-500" />
                    <span className="text-[10px] font-bold uppercase tracking-tight">Remove</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Quick Stats */}
            <div className="bg-slate-900 rounded-3xl p-6 text-white shadow-xl shadow-indigo-500/10">
              <div className="flex items-center justify-between mb-4">
                <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Activity Summary</p>
                <Activity size={16} className="text-indigo-400" />
              </div>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-400">Total Actions</span>
                  <span className="text-lg font-black">{stats.total}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-400">Today</span>
                  <span className="text-lg font-black text-indigo-400">{stats.today}</span>
                </div>
                <div className="pt-4 border-t border-slate-800">
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Last Action</p>
                  <p className="text-sm font-bold truncate text-slate-200">{stats.lastAction}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column - Forms */}
          <div className="lg:col-span-8 space-y-6">
            {/* General Information */}
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/30 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <UserIcon size={18} className="text-indigo-500" />
                  <h3 className="font-black text-slate-800 text-sm uppercase tracking-widest">Personal Details</h3>
                </div>
              </div>
              <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-xs font-black text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                    <Mail size={12} /> Work Email
                  </label>
                  <input
                    type="email"
                    value={profileData.email}
                    onChange={e => setProfileData(prev => ({ ...prev, email: e.target.value }))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 font-medium text-slate-800 outline-none focus:ring-4 focus:ring-indigo-500/5 focus:border-indigo-500 transition-all text-sm"
                    placeholder="email@organization.com"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-black text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                    <Phone size={12} /> Contact Phone
                  </label>
                  <input
                    type="tel"
                    value={profileData.phone}
                    onChange={e => setProfileData(prev => ({ ...prev, phone: e.target.value }))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 font-medium text-slate-800 outline-none focus:ring-4 focus:ring-indigo-500/5 focus:border-indigo-500 transition-all text-sm"
                    placeholder="+1 (555) 000-0000"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-black text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                    <Briefcase size={12} /> Job Title
                  </label>
                  <input
                    value={profileData.jobTitle}
                    onChange={e => setProfileData(prev => ({ ...prev, jobTitle: e.target.value }))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 font-medium text-slate-800 outline-none focus:ring-4 focus:ring-indigo-500/5 focus:border-indigo-500 transition-all text-sm"
                    placeholder="Financial Controller"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-black text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                    <Globe size={12} /> Timezone
                  </label>
                  <select
                    value={profileData.timezone}
                    onChange={e => setProfileData(prev => ({ ...prev, timezone: e.target.value }))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 font-medium text-slate-800 outline-none focus:ring-4 focus:ring-indigo-500/5 focus:border-indigo-500 transition-all text-sm appearance-none cursor-pointer"
                  >
                    {TIMEZONES.map(tz => (
                      <option key={tz.value} value={tz.value}>{tz.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Password Management */}
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/30 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Key size={18} className="text-indigo-500" />
                  <h3 className="font-black text-slate-800 text-sm uppercase tracking-widest">Security</h3>
                </div>
              </div>
              <div className="p-6 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-black text-slate-500 uppercase tracking-wider">New Password</label>
                    <div className="relative">
                      <input
                        type={showPasswords ? 'text' : 'password'}
                        value={newPassword}
                        onChange={e => setNewPassword(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 pr-10 font-medium text-slate-800 outline-none focus:ring-4 focus:ring-indigo-500/5 focus:border-indigo-500 transition-all text-sm"
                        placeholder="Enter new password"
                      />
                      <button onClick={() => setShowPasswords(!showPasswords)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                        {showPasswords ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-black text-slate-500 uppercase tracking-wider">Confirm Password</label>
                    <input
                      type={showPasswords ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={e => setConfirmPassword(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 font-medium text-slate-800 outline-none focus:ring-4 focus:ring-indigo-500/5 focus:border-indigo-500 transition-all text-sm"
                      placeholder="Repeat password"
                    />
                  </div>
                </div>

                {newPassword && (
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                    {!passwordValidation.valid ? (
                      <p className="text-xs text-rose-500 flex items-center gap-1.5 font-bold">
                        <AlertCircle size={14} /> {passwordValidation.errors[0]}
                      </p>
                    ) : (
                      <p className="text-xs text-emerald-600 flex items-center gap-1.5 font-bold">
                        <CheckCircle2 size={14} /> Password complexity requirements met
                      </p>
                    )}
                  </div>
                )}

                <div className="flex justify-end pt-2">
                  <button
                    onClick={handleChangePassword}
                    disabled={saving || !newPassword || !confirmPassword || !!passwordValidation.errors?.length}
                    className="flex items-center gap-2 px-6 py-2.5 bg-slate-900 text-white rounded-xl font-bold text-sm hover:bg-slate-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 shadow-lg shadow-slate-900/10"
                  >
                    {saving ? <Loader2 size={16} className="animate-spin" /> : <Shield size={16} />}
                    Update Security
                  </button>
                </div>
              </div>
            </div>

            {/* Recent Activity */}
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/30 flex items-center gap-2">
                <History size={18} className="text-indigo-500" />
                <h3 className="font-black text-slate-800 text-sm uppercase tracking-widest">Recent Logs</h3>
              </div>
              <div className="max-h-64 overflow-y-auto custom-scrollbar">
                {userLogs.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                    <Activity size={32} className="mb-2 opacity-30" />
                    <p className="font-black uppercase tracking-widest text-[10px]">No activity history</p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {userLogs.slice(0, 10).map((log: any) => (
                      <div key={log.id} className="flex items-center gap-4 px-6 py-3.5 hover:bg-slate-50/50 transition-colors">
                        <div className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center text-indigo-500 border border-slate-100">
                          <Activity size={14} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-slate-800">{log.action}</p>
                          <p className="text-[10px] text-slate-500 font-medium">{new Date(log.date).toLocaleString()}</p>
                        </div>
                        <ChevronRight size={14} className="text-slate-300" />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Summary Modal */}
      <Dialog 
        open={showSummaryModal} 
        onClose={() => setShowSummaryModal(false)}
        title="Review Profile Changes"
      >
        <div className="space-y-6">
          <p className="text-sm text-slate-500">You are about to save the following updates to your profile:</p>
          <div className="space-y-3 bg-slate-50 p-4 rounded-2xl border border-slate-200">
            {changedFields.map(field => (
              <div key={field} className="flex items-center gap-3 text-sm">
                <div className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                <span className="font-bold text-slate-700">{field}</span>
                <span className="text-slate-400">was modified</span>
              </div>
            ))}
          </div>
          <div className="flex gap-3 pt-2">
            <button
              onClick={() => setShowSummaryModal(false)}
              className="flex-1 px-6 py-3 border border-slate-200 text-slate-600 rounded-xl font-bold text-sm hover:bg-slate-50 transition-all active:scale-95"
            >
              Cancel
            </button>
            <button
              onClick={handleBatchSave}
              disabled={saving}
              className="flex-1 px-6 py-3 bg-indigo-600 text-white rounded-xl font-bold text-sm hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-500/20 active:scale-95 flex items-center justify-center gap-2"
            >
              {saving ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
              Confirm & Save
            </button>
          </div>
        </div>
      </Dialog>

      {/* Cropping Modal Placeholder */}
      <Dialog 
        open={showCropModal} 
        onClose={() => setShowCropModal(false)}
        title="Adjust Profile Photo"
      >
        <div className="space-y-6">
          <div className="aspect-square w-full bg-slate-100 rounded-2xl overflow-hidden relative flex items-center justify-center">
            {tempImage && (
              <img src={tempImage} alt="Preview" className="max-w-full max-h-full object-contain" />
            )}
            <div className="absolute inset-0 border-2 border-dashed border-white/50 m-8 rounded-full pointer-events-none" />
          </div>
          <div className="flex items-center justify-center gap-6">
             <div className="flex flex-col items-center gap-1">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Predefined</span>
                <div className="flex gap-2">
                  {PREDEFINED_AVATARS.map((url, i) => (
                    <button 
                      key={i} 
                      onClick={() => { setTempImage(url); }}
                      className="w-10 h-10 rounded-full border-2 border-white shadow-sm hover:scale-110 transition-transform overflow-hidden"
                    >
                      <img src={url} alt={`Avatar ${i}`} className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
             </div>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => setShowCropModal(false)}
              className="flex-1 px-6 py-3 border border-slate-200 text-slate-600 rounded-xl font-bold text-sm hover:bg-slate-50 transition-all active:scale-95"
            >
              Cancel
            </button>
            <button
              onClick={handleCropSave}
              className="flex-1 px-6 py-3 bg-indigo-600 text-white rounded-xl font-bold text-sm hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-500/20 active:scale-95 flex items-center justify-center gap-2"
            >
              <ImageIcon size={18} />
              Set Photo
            </button>
          </div>
        </div>
      </Dialog>
    </div>
  );
};


export default Profile;
