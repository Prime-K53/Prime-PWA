
import React, { useState, useRef } from 'react';
import { Users, Shield, Lock, Plus, Edit2, Trash2, Check, X, Key, Loader2, Camera, ShieldCheck, QrCode, Smartphone } from 'lucide-react';
import { useData } from '../../context/DataContext';
import { User, UserGroup } from '../../types';
import { AVAILABLE_PERMISSIONS } from '../../constants';
import { localFileStorage } from '../../services/localFileStorage';
import { OfflineImage } from '../../components/OfflineImage';

const UserManagement: React.FC = () => {
  const { allUsers, userGroups, manageUser, deleteUser, manageUserGroup, deleteUserGroup, passwordPolicy, updatePasswordPolicy, checkPermission, validatePasswordStrength, notify } = useData();
  const [activeTab, setActiveTab] = useState<'Users' | 'Groups' | 'Policies'>('Users');

  // User Modal State
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [editUser, setEditUser] = useState<Partial<User>>({});
  const [passwordError, setPasswordError] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // MFA Setup State
  const [showMfaSetup, setShowMfaSetup] = useState(false);
  const [mfaStep, setMfaStep] = useState(1);
  const [tempMfaSecret, setTempMfaSecret] = useState('');
  const [mfaCode, setMfaCode] = useState('');

  // Group Modal State
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
  const [editGroup, setEditGroup] = useState<Partial<UserGroup>>({});

  const handleUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editUser.username || !editUser.name) return;

    // Validate Password if changed/new
    if (editUser.password) {
       const validation = validatePasswordStrength(editUser.password);
       if (!validation.valid) {
          setPasswordError(validation.errors);
          return;
       }
    }

    setIsSaving(true);
    await manageUser(editUser as User);
    setIsSaving(false);
    
    setIsUserModalOpen(false);
    setPasswordError([]);
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
          try {
              const id = await localFileStorage.save(file);
              setEditUser(prev => ({ ...prev, avatar: id }));
              notify("Photo uploaded successfully", "success");
          } catch (error) {
              notify("Failed to save photo", "error");
          }
      }
  };

  const startMfaSetup = (user: User) => {
      setEditUser(user);
      setTempMfaSecret('NEXUS-' + Math.random().toString(36).substring(2, 10).toUpperCase());
      setMfaStep(1);
      setShowMfaSetup(true);
  };

  const verifyMfaCode = () => {
      // In a real system, we'd use a TOTP library to verify the code against the secret.
      // For this native-desktop prototype, we'll implement a validation rule (must be 6 digits).
      if (/^\d{6}$/.test(mfaCode)) {
          setMfaStep(2);
          setTimeout(async () => {
              await manageUser({ ...editUser as User, mfaEnabled: true, mfaSecret: tempMfaSecret, securityLevel: 'Elevated' });
              setShowMfaSetup(false);
              notify("MFA Enabled Successfully", "success");
          }, 1000);
      } else {
          notify("Invalid 6-digit security code.", "error");
      }
  };

  const handleGroupSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editGroup.name) return;
    manageUserGroup(editGroup as UserGroup);
    setIsGroupModalOpen(false);
  };

  const togglePermission = (permId: string) => {
    const currentPerms = editGroup.permissions || [];
    if (currentPerms.includes(permId)) {
      setEditGroup({ ...editGroup, permissions: currentPerms.filter(p => p !== permId) });
    } else {
      setEditGroup({ ...editGroup, permissions: [...currentPerms, permId] });
    }
  };

  const handleEnforceMfa = async () => {
      if(window.confirm("This will enable MFA for all active users. Continue?")) {
          for(const u of allUsers) {
              if(u.active && !u.mfaEnabled) {
                  await manageUser({...u, mfaEnabled: true, securityLevel: 'Elevated'});
              }
          }
          notify("MFA Enforced for all active users", "success");
      }
  };

  const renderUsers = () => (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-bold text-slate-800">System Users</h2>
        <button onClick={() => { setEditUser({ id: '', active: true, mfaEnabled: false, groupIds: [], securityLevel: 'Standard' }); setPasswordError([]); setIsUserModalOpen(true); }} className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 font-medium hover:bg-blue-700">
          <Plus size={18}/> Add User
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
            <tr>
              <th className="p-4">User</th>
              <th className="p-4">Role</th>
              <th className="p-4">Groups</th>
              <th className="p-4">Security</th>
              <th className="p-4">Status</th>
              <th className="p-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {allUsers.map(u => (
              <tr key={u.id} className="hover:bg-slate-50 group">
                <td className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-xs overflow-hidden border border-blue-200">
                      <OfflineImage src={u.avatar} alt={u.name} className="w-full h-full object-cover" fallback={u.name.substring(0, 2)}/>
                    </div>
                    <div>
                      <div className="font-medium text-slate-900">{u.name}</div>
                      <div className="text-xs text-slate-500">@{u.username}</div>
                    </div>
                  </div>
                </td>
                <td className="p-4 text-slate-600">{u.role}</td>
                <td className="p-4">
                  <div className="flex gap-1 flex-wrap">
                    {u.groupIds?.map(gid => {
                      const g = userGroups.find(grp => grp.id === gid);
                      return g ? <span key={gid} className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-xs border border-slate-200">{g.name}</span> : null;
                    })}
                  </div>
                </td>
                <td className="p-4">
                  <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${u.mfaEnabled ? 'bg-emerald-500' : 'bg-amber-500'}`}></div>
                      <div className="flex flex-col">
                          <span className="text-xs font-bold text-slate-700">{u.securityLevel || 'Standard'}</span>
                          <button 
                            onClick={() => !u.mfaEnabled && startMfaSetup(u)}
                            className={`text-[10px] uppercase font-black tracking-widest ${u.mfaEnabled ? 'text-emerald-600' : 'text-blue-600 hover:underline'}`}
                          >
                              {u.mfaEnabled ? 'MFA ACTIVE' : 'SETUP MFA'}
                          </button>
                      </div>
                  </div>
                </td>
                <td className="p-4">
                  <span className={`px-2 py-1 rounded-full text-xs font-bold ${u.active ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>
                    {u.active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="p-4 text-right flex justify-end gap-2">
                  <button onClick={() => { setEditUser({...u, password: ''}); setPasswordError([]); setIsUserModalOpen(true); }} className="p-2 text-slate-400 hover:text-blue-600 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"><Edit2 size={16}/></button>
                  <button onClick={() => deleteUser(u.id)} className="p-2 text-slate-400 hover:text-red-600 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 size={16}/></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderGroups = () => (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-bold text-slate-800">User Groups & Roles</h2>
        <button onClick={() => { setEditGroup({ id: '', permissions: [] }); setIsGroupModalOpen(true); }} className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 font-medium hover:bg-blue-700">
          <Plus size={18}/> New Group
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {userGroups.map(g => (
          <div key={g.id} className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="font-bold text-slate-900">{g.name}</h3>
                <p className="text-xs text-slate-500 mt-1">{g.description || 'No description'}</p>
              </div>
              <div className="flex gap-1">
                 <button onClick={() => { setEditGroup(g); setIsGroupModalOpen(true); }} className="p-1.5 text-slate-400 hover:text-blue-600 rounded"><Edit2 size={16}/></button>
                 <button onClick={() => deleteUserGroup(g.id)} className="p-1.5 text-slate-400 hover:text-red-600 rounded"><Trash2 size={16}/></button>
              </div>
            </div>
            <div className="text-xs text-slate-600 mb-2 font-medium uppercase tracking-wider">Permissions</div>
            <div className="flex flex-wrap gap-2">
              {(g.permissions || []).slice(0, 5).map(p => (
                <span key={p} className="px-2 py-1 bg-blue-50 text-blue-700 rounded text-xs border border-blue-100">
                  {AVAILABLE_PERMISSIONS.find(ap => ap.id === p)?.label || p}
                </span>
              ))}
              {(g.permissions || []).length > 5 && <span className="text-xs text-slate-400 flex items-center">+{g.permissions.length - 5} more</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const renderPolicies = () => (
    <div className="max-w-2xl">
       <h2 className="text-lg font-bold text-slate-800 mb-6">Global Security Policies</h2>
       <div className="bg-white p-8 rounded-xl border border-slate-200 shadow-sm space-y-6">
          <div className="flex justify-between items-center border-b border-slate-100 pb-6">
             <div>
                <h3 className="font-bold text-slate-900">Password Complexity</h3>
                <p className="text-sm text-slate-500">Minimum requirements for user passwords</p>
             </div>
             <div className="text-right space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                   <span className="text-sm text-slate-700">Require Special Character</span>
                   <input type="checkbox" className="w-4 h-4 rounded text-blue-600" checked={passwordPolicy.requireSpecialChar} onChange={e => updatePasswordPolicy({...passwordPolicy, requireSpecialChar: e.target.checked})}/>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                   <span className="text-sm text-slate-700">Require Number</span>
                   <input type="checkbox" className="w-4 h-4 rounded text-blue-600" checked={passwordPolicy.requireNumber} onChange={e => updatePasswordPolicy({...passwordPolicy, requireNumber: e.target.checked})}/>
                </label>
             </div>
          </div>

          <div className="grid grid-cols-2 gap-6">
             <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Minimum Length</label>
                <input 
                  type="number" 
                  className="w-full p-2 border border-slate-200 rounded-lg"
                  value={passwordPolicy.minLength}
                  onChange={e => updatePasswordPolicy({...passwordPolicy, minLength: parseInt(e.target.value)})}
                />
             </div>
             <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Expiration (Days)</label>
                <input 
                  type="number" 
                  className="w-full p-2 border border-slate-200 rounded-lg"
                  value={passwordPolicy.expirationDays}
                  onChange={e => updatePasswordPolicy({...passwordPolicy, expirationDays: parseInt(e.target.value)})}
                />
             </div>
          </div>
          
          <div className="pt-4 bg-blue-50 p-4 rounded-lg border border-blue-100 flex items-start gap-3">
             <Lock className="text-blue-600 shrink-0 mt-1" size={20}/>
             <div>
                <h4 className="font-bold text-blue-800 text-sm">MFA Enforcement</h4>
                <p className="text-xs text-blue-600 mt-1">Multi-Factor Authentication is currently optional. Enable strict mode to force MFA for all Admin and Manager accounts.</p>
                <button onClick={handleEnforceMfa} className="mt-3 text-xs bg-blue-600 text-white px-3 py-1.5 rounded font-bold hover:bg-blue-700 shadow-sm">Enforce MFA Across System</button>
             </div>
          </div>
       </div>
    </div>
  );

  return (
    <div className="p-6 max-w-[1600px] mx-auto">
      {/* User Modal */}
      {isUserModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
           <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-6 animate-fadeIn">
              <h2 className="text-xl font-bold mb-4">{editUser.id ? 'Edit User' : 'New User'}</h2>
              <form onSubmit={handleUserSubmit} className="space-y-4">
                 <div className="flex justify-center mb-4">
                    <div className="flex flex-col items-center gap-2">
                        <div className="relative group w-24 h-24 rounded-full bg-slate-100 border-2 border-slate-200 overflow-hidden flex items-center justify-center cursor-pointer shadow-sm hover:border-blue-400 transition-colors" onClick={() => fileInputRef.current?.click()}>
                            {editUser.avatar ? (
                                <OfflineImage src={editUser.avatar} alt="Avatar" className="w-full h-full object-cover"/>
                            ) : (
                                <Camera size={24} className="text-slate-400"/>
                            )}
                            <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-white text-xs font-bold">Change</div>
                            <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleAvatarUpload}/>
                        </div>
                        <button type="button" onClick={() => fileInputRef.current?.click()} className="text-xs text-blue-600 font-bold hover:underline">Upload Photo</button>
                    </div>
                 </div>

                 <div className="grid grid-cols-2 gap-4">
                    <div>
                       <label className="text-xs font-bold text-slate-500 uppercase">Username</label>
                       <input type="text" className="w-full p-2 border rounded-lg mt-1" value={editUser.username} onChange={e => setEditUser({...editUser, username: e.target.value})}/>
                    </div>
                    <div>
                       <label className="text-xs font-bold text-slate-500 uppercase">Full Name</label>
                       <input type="text" className="w-full p-2 border rounded-lg mt-1" value={editUser.name} onChange={e => setEditUser({...editUser, name: e.target.value})}/>
                    </div>
                 </div>
                 <div>
                    <label className="text-xs font-bold text-slate-500 uppercase">Role</label>
                    <select className="w-full p-2 border rounded-lg mt-1" value={editUser.role} onChange={e => setEditUser({...editUser, role: e.target.value as any})}>
                       <option value="Admin">Admin</option>
                       <option value="Manager">Manager</option>
                       <option value="Cashier">Cashier</option>
                       <option value="Operator">Operator</option>
                    </select>
                 </div>
                 <div>
                     <label className="text-xs font-bold text-slate-500 uppercase">Password {editUser.id && '(Leave blank to keep current)'}</label>
                     <input 
                       type="password" 
                       className={`w-full p-2 border rounded-lg mt-1 ${passwordError.length > 0 ? 'border-red-500 bg-red-50' : ''}`} 
                       value={editUser.password || ''} 
                       onChange={e => setEditUser({...editUser, password: e.target.value})}
                       placeholder={editUser.id ? "********" : "Enter password"}
                     />
                     {passwordError.map((err, i) => <div key={i} className="text-xs text-red-600 mt-1">{err}</div>)}
                 </div>
                 <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                    <label className="flex items-center gap-2 cursor-pointer">
                       <input type="checkbox" checked={editUser.active} onChange={e => setEditUser({...editUser, active: e.target.checked})} className="w-4 h-4 rounded text-blue-600"/>
                       <span className="text-sm font-medium">Active Account</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                       <input type="checkbox" checked={editUser.mfaEnabled} onChange={e => setEditUser({...editUser, mfaEnabled: e.target.checked})} className="w-4 h-4 rounded text-blue-600"/>
                       <span className="text-sm font-medium">MFA Enabled</span>
                    </label>
                 </div>
                 <div className="flex gap-3 mt-6">
                    <button type="button" onClick={() => setIsUserModalOpen(false)} className="flex-1 py-2 border rounded-lg font-bold text-slate-600">Cancel</button>
                    <button 
                        type="submit" 
                        disabled={isSaving}
                        className="flex-1 py-2 bg-blue-600 text-white font-bold rounded-lg flex items-center justify-center gap-2 disabled:opacity-70 shadow-md"
                    >
                        {isSaving ? <Loader2 size={16} className="animate-spin"/> : 'Save User'}
                    </button>
                 </div>
              </form>
           </div>
        </div>
      )}

      {/* MFA SETUP MODAL */}
      {showMfaSetup && (
          <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm">
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95">
                  <div className="p-6 bg-slate-900 text-white flex justify-between items-center">
                      <h2 className="text-xl font-bold flex items-center gap-3">
                          <ShieldCheck className="text-emerald-400"/> Security Activation
                      </h2>
                      <button onClick={() => setShowMfaSetup(false)}><X/></button>
                  </div>
                  
                  <div className="p-8 text-center">
                      {mfaStep === 1 ? (
                          <div className="animate-fadeIn">
                              <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
                                  <Smartphone size={32}/>
                              </div>
                              <h3 className="text-lg font-bold text-slate-800 mb-2">Authenticator App</h3>
                              <p className="text-sm text-slate-500 mb-6">Scan this QR code with Google Authenticator or Microsoft Authenticator.</p>
                              
                              <div className="w-48 h-48 bg-slate-100 rounded-xl mx-auto mb-6 flex items-center justify-center border-2 border-slate-200">
                                  <QrCode size={120} className="text-slate-800 opacity-80"/>
                              </div>
                              
                              <div className="mb-6">
                                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Manual Entry Code</p>
                                  <div className="font-mono bg-slate-50 p-2 rounded border border-slate-200 text-blue-600 font-bold select-all tracking-wider">
                                      {tempMfaSecret}
                                  </div>
                              </div>
                              
                              <div className="space-y-4">
                                  <input 
                                      type="text" 
                                      className="w-full text-center text-2xl font-black tracking-[0.5em] p-3 border-2 border-blue-100 rounded-xl outline-none focus:border-blue-600"
                                      placeholder="000000"
                                      maxLength={6}
                                      value={mfaCode}
                                      onChange={e => setMfaCode(e.target.value)}
                                  />
                                  <button 
                                      onClick={verifyMfaCode}
                                      className="w-full py-4 bg-slate-900 text-white rounded-xl font-bold hover:bg-black shadow-lg transition-all active:scale-95"
                                  >
                                      Verify & Activate
                                  </button>
                              </div>
                          </div>
                      ) : (
                          <div className="py-12 animate-in zoom-in-95">
                              <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-6">
                                  <Check size={40} strokeWidth={3}/>
                              </div>
                              <h3 className="text-2xl font-bold text-slate-900 mb-2">MFA Verified</h3>
                              <p className="text-slate-500 mb-8">Elevated security has been applied to this account.</p>
                              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 inline-block">
                                  <p className="text-xs font-bold text-slate-400 uppercase">Security Level</p>
                                  <p className="text-emerald-600 font-black">ELEVATED</p>
                              </div>
                          </div>
                      )}
                  </div>
              </div>
          </div>
      )}

      {/* Group Modal */}
      {isGroupModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
           <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl h-[80vh] flex flex-col animate-fadeIn">
              <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                 <h2 className="text-xl font-bold">{editGroup.id ? 'Edit User Group' : 'Create User Group'}</h2>
                 <button onClick={() => setIsGroupModalOpen(false)}><X/></button>
              </div>
              <div className="flex-1 overflow-hidden flex">
                 <div className="w-1/3 p-6 border-r border-slate-100 space-y-4">
                    <div>
                       <label className="text-xs font-bold text-slate-500 uppercase">Group Name</label>
                       <input type="text" className="w-full p-2 border rounded-lg mt-1" value={editGroup.name} onChange={e => setEditGroup({...editGroup, name: e.target.value})}/>
                    </div>
                    <div>
                       <label className="text-xs font-bold text-slate-500 uppercase">Description</label>
                       <textarea className="w-full p-2 border rounded-lg mt-1 h-24 resize-none" value={editGroup.description} onChange={e => setEditGroup({...editGroup, description: e.target.value})}/>
                    </div>
                 </div>
                 <div className="flex-1 p-6 overflow-y-auto bg-slate-50">
                    <h3 className="text-sm font-bold text-slate-700 mb-4">Permissions Matrix</h3>
                    <div className="grid grid-cols-2 gap-4">
                       {Array.from(new Set(AVAILABLE_PERMISSIONS.map(p => p.module))).map(module => (
                          <div key={module} className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
                             <h4 className="text-xs font-bold text-slate-400 uppercase mb-3 pb-2 border-b border-slate-100">{module}</h4>
                             <div className="space-y-2">
                                {AVAILABLE_PERMISSIONS.filter(p => p.module === module).map(perm => (
                                   <label key={perm.id} className="flex items-center gap-3 cursor-pointer hover:bg-slate-50 p-1 rounded">
                                      <input 
                                        type="checkbox" 
                                        className="w-4 h-4 rounded border-slate-300 text-blue-600"
                                        checked={editGroup.permissions?.includes(perm.id)}
                                        onChange={() => togglePermission(perm.id)}
                                      />
                                      <span className="text-sm text-slate-700">{perm.label}</span>
                                   </label>
                                ))}
                             </div>
                          </div>
                       ))}
                    </div>
                 </div>
              </div>
              <div className="p-6 border-t border-slate-100 bg-white flex justify-end gap-3">
                 <button onClick={() => setIsGroupModalOpen(false)} className="px-6 py-2 border rounded-lg font-medium">Cancel</button>
                 <button onClick={handleGroupSubmit} className="px-6 py-2 bg-blue-600 text-white font-bold rounded-lg">Save Group</button>
              </div>
           </div>
        </div>
      )}

      <div className="flex flex-col md:flex-row justify-between items-center mb-6">
         <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
               <Shield className="text-blue-600"/> Security & Access Control
            </h1>
            <p className="text-slate-500 mt-1">Configure user accounts, permission roles, and global security policies.</p>
         </div>
      </div>

      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl mb-8 w-fit">
         <button onClick={() => setActiveTab('Users')} className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'Users' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
            Users
         </button>
         <button onClick={() => setActiveTab('Groups')} className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'Groups' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
            Groups & Roles
         </button>
         <button onClick={() => setActiveTab('Policies')} className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'Policies' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
            Security Policies
         </button>
      </div>

      <div className="animate-fadeIn">
         {activeTab === 'Users' && renderUsers()}
         {activeTab === 'Groups' && renderGroups()}
         {activeTab === 'Policies' && renderPolicies()}
      </div>
    </div>
  );
};

export default UserManagement;
