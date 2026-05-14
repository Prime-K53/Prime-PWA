import React, { useState, useEffect } from 'react';
import {
    Plus, Trash2, Save, Layers,
    Search, Edit2, FileText, Clock
} from 'lucide-react';
import { useData } from '../../context/DataContext';
import { BOMTemplate, Item } from '../../types';
import { dbService } from '../../services/db';
import { repriceMasterInventoryFromAdjustments } from '../../services/masterInventoryPricingService';

const BOMRecipes: React.FC = () => {
    const { inventory, notify, companyConfig, updateCompanyConfig, addAuditLog } = useData();
    const [activeTab, setActiveTab] = useState<'Templates'>('Templates');
    const [templates, setTemplates] = useState<BOMTemplate[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    // Template Editor State
    const [editingTemplate, setEditingTemplate] = useState<Partial<BOMTemplate> | null>(null);
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setIsLoading(true);
        try {
            const [t] = await Promise.all([
                dbService.getAll<BOMTemplate>('bomTemplates')
            ]);
            setTemplates(t);
        } catch (error) {
            notify("Failed to load BOM data", "error");
        } finally {
            setIsLoading(false);
        }
    };

    const handleSaveTemplate = async () => {
        if (!editingTemplate?.name || !editingTemplate?.type) {
            notify("Name and Type are required", "error");
            return;
        }
        try {
            const template = {
                ...editingTemplate,
                id: editingTemplate.id || `tpl-${Date.now()}`,
                components: editingTemplate.components || [],
                lastUpdated: new Date().toISOString()
            } as BOMTemplate;

            const isNew = !editingTemplate.id;
            const oldVal = isNew ? null : templates.find(t => t.id === editingTemplate.id);
            
            await dbService.put('bomTemplates', template);
            await repriceMasterInventoryFromAdjustments();
            
            addAuditLog({
                action: isNew ? 'CREATE' : 'UPDATE',
                entityType: 'BOMRecipe',
                entityId: template.id,
                details: `${isNew ? 'Created' : 'Updated'} BOM Recipe: ${template.name}`,
                oldValue: oldVal,
                newValue: template
            });

            notify("BOM Recipe saved successfully", "success");
            setEditingTemplate(null);
            loadData();
        } catch (error) {
            notify("Failed to save BOM Recipe", "error");
        }
    };

    const handleDeleteTemplate = async (id: string) => {
        if (!window.confirm("Are you sure you want to delete this BOM Recipe?")) return;
        try {
            const oldVal = templates.find(t => t.id === id);
            await dbService.delete('bomTemplates', id);
            await repriceMasterInventoryFromAdjustments();
            
            addAuditLog({
                action: 'DELETE',
                entityType: 'BOMRecipe',
                entityId: id,
                details: `Deleted BOM Recipe: ${oldVal?.name || id}`,
                oldValue: oldVal
            });

            notify("BOM Recipe deleted", "success");
            loadData();
        } catch (error) {
            notify("Failed to delete BOM Recipe", "error");
        }
    };

    const addComponent = () => {
        if (!editingTemplate) return;
        const newComponents = [...(editingTemplate.components || []), { itemId: '', name: '', quantityFormula: '1', unit: '' }];
        setEditingTemplate({ ...editingTemplate, components: newComponents as any });
    };

    const updateComponent = (index: number, field: string, value: any) => {
        if (!editingTemplate?.components) return;
        const newComponents = [...editingTemplate.components];
        const updatedComponent = { ...newComponents[index], [field]: value };

        // Auto-update unit if itemId changes
        if (field === 'itemId') {
            const item = inventory.find(i => i.id === value);
            if (item) {
                updatedComponent.unit = item.unit;
            }
        }

        newComponents[index] = updatedComponent;
        setEditingTemplate({ ...editingTemplate, components: newComponents });
    };

    const removeComponent = (index: number) => {
        if (!editingTemplate?.components) return;
        const newComponents = editingTemplate.components.filter((_, i) => i !== index);
        setEditingTemplate({ ...editingTemplate, components: newComponents });
    };

    return (
        <div className="flex flex-col h-full bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-rose-50 text-rose-600 rounded-lg">
                        <FileText size={24} />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-slate-900">BOM Recipes</h2>
                        <p className="text-sm text-slate-500">Manage production Bill of Materials and cost structures</p>
                    </div>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                <div className="space-y-6">
                    {editingTemplate ? (
                        <div className="bg-slate-50 rounded-2xl p-6 border border-slate-200 animate-in fade-in slide-in-from-top-4">
                            <div className="flex justify-between items-center mb-6">
                                <h3 className="font-bold text-lg text-slate-900">{editingTemplate.id ? 'Edit BOM Recipe' : 'New BOM Recipe'}</h3>
                                <div className="flex gap-2">
                                    <button onClick={() => setEditingTemplate(null)} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 rounded-xl transition-all">Cancel</button>
                                    <button onClick={handleSaveTemplate} className="flex items-center gap-2 px-6 py-2 bg-rose-600 text-white rounded-xl text-sm font-bold hover:bg-rose-700 shadow-lg shadow-rose-200 transition-all">
                                        <Save size={18} /> Save BOM Recipe
                                    </button>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-2">Recipe Name</label>
                                    <input
                                        type="text"
                                        value={editingTemplate.name || ''}
                                        onChange={e => setEditingTemplate({ ...editingTemplate, name: e.target.value })}
                                        placeholder="e.g. Standard 80-page Book"
                                        className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 outline-none transition-all"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-2">Production Type</label>
                                    <select
                                        value={editingTemplate.type || ''}
                                        onChange={e => setEditingTemplate({ ...editingTemplate, type: e.target.value as any })}
                                        className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 outline-none transition-all"
                                    >
                                        <option value="">Select Type</option>
                                        <option value="Book">Book</option>
                                        <option value="Exam Sheet">Exam Sheet</option>
                                        <option value="Flyer">Flyer</option>
                                        <option value="Poster">Poster</option>
                                        <option value="Custom">Custom</option>
                                    </select>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <div className="flex justify-between items-center">
                                    <h4 className="font-bold text-slate-900 flex items-center gap-2">
                                        <Layers size={18} className="text-rose-600" /> Components & Materials
                                    </h4>
                                    <button onClick={addComponent} className="flex items-center gap-1.5 text-rose-600 hover:text-rose-700 font-bold text-sm">
                                        <Plus size={18} /> Add Component
                                    </button>
                                </div>

                                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                                    <table className="w-full text-left text-sm">
                                        <thead className="bg-slate-50 border-b border-slate-100">
                                            <tr>
                                                <th className="px-4 py-3 font-bold text-slate-700">Material / Item</th>
                                                <th className="px-4 py-3 font-bold text-slate-700">Quantity Formula</th>
                                                <th className="px-4 py-3 font-bold text-slate-700">Unit</th>
                                                <th className="px-4 py-3 font-bold text-slate-700 w-20"></th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {editingTemplate.components?.map((comp, idx) => (
                                                <tr key={idx}>
                                                    <td className="px-4 py-2">
                                                        <select
                                                            value={comp.itemId}
                                                            onChange={e => updateComponent(idx, 'itemId', e.target.value)}
                                                            className="w-full bg-transparent outline-none focus:text-rose-600"
                                                        >
                                                            <option value="">Select Material</option>
                                                            {inventory
                                                                .filter(i => i.type !== 'Service')
                                                                .filter((item, index, self) => index === self.findIndex((t) => t.id === item.id))
                                                                .map(i => (
                                                                    <option key={i.id} value={i.id}>{i.name} ({i.sku})</option>
                                                                ))}
                                                        </select>
                                                    </td>
                                                    <td className="px-4 py-2">
                                                        <input
                                                            type="text"
                                                            value={comp.quantityFormula}
                                                            onChange={e => updateComponent(idx, 'quantityFormula', e.target.value)}
                                                            placeholder="e.g. quantity * pages / 2"
                                                            className="w-full bg-transparent outline-none focus:text-rose-600 font-mono text-xs"
                                                        />
                                                    </td>
                                                    <td className="px-4 py-2">
                                                        <input
                                                            type="text"
                                                            value={comp.unit || ''}
                                                            onChange={e => updateComponent(idx, 'unit', e.target.value)}
                                                            placeholder="Unit"
                                                            className="w-full bg-transparent outline-none focus:text-rose-600 text-xs"
                                                        />
                                                    </td>
                                                    <td className="px-4 py-2 text-right">
                                                        <button onClick={() => removeComponent(idx)} className="text-slate-400 hover:text-red-500 transition-colors">
                                                            <Trash2 size={16} />
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                            {(!editingTemplate.components || editingTemplate.components.length === 0) && (
                                                <tr>
                                                    <td colSpan={4} className="px-4 py-8 text-center text-slate-400 italic">
                                                        No components added. Click "Add Component" to start.
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div className="flex justify-between items-center">
                                <div className="relative w-72">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                                    <input
                                        type="text"
                                        placeholder="Search recipes..."
                                        value={searchTerm}
                                        onChange={e => setSearchTerm(e.target.value)}
                                        className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 outline-none transition-all text-sm"
                                    />
                                </div>
                                <button
                                    onClick={() => setEditingTemplate({ name: '', type: 'Book', components: [], isDefault: false })}
                                    className="flex items-center gap-2 px-4 py-2 bg-rose-600 text-white rounded-xl text-sm font-bold hover:bg-rose-700 shadow-lg shadow-rose-200 transition-all"
                                >
                                    <Plus size={18} /> Create BOM Recipe
                                </button>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {templates.filter(t => t.name.toLowerCase().includes(searchTerm.toLowerCase())).map(template => (
                                    <div key={template.id} className="group bg-white border border-slate-200 p-5 rounded-2xl hover:border-rose-500 hover:shadow-md transition-all">
                                        <div className="flex justify-between items-start mb-3">
                                            <div>
                                                <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${template.type === 'Book' ? 'bg-blue-50 text-blue-600' :
                                                    template.type === 'Exam Sheet' ? 'bg-purple-50 text-purple-600' :
                                                        'bg-slate-50 text-slate-600'
                                                    }`}>
                                                    {template.type}
                                                </span>
                                                <h4 className="font-bold text-slate-900 mt-1">{template.name}</h4>
                                            </div>
                                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button onClick={() => setEditingTemplate(template)} className="p-1.5 text-slate-400 hover:text-rose-600 transition-colors">
                                                    <Edit2 size={16} />
                                                </button>
                                                <button onClick={() => handleDeleteTemplate(template.id)} className="p-1.5 text-slate-400 hover:text-red-600 transition-colors">
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-4 text-xs text-slate-500">
                                            <span className="flex items-center gap-1"><Layers size={14} /> {template.components?.length || 0} Items</span>
                                            <span className="flex items-center gap-1"><Clock size={14} /> Updated {new Date(template.lastUpdated).toLocaleDateString()}</span>
                                        </div>
                                    </div>
                                ))}
                                {templates.length === 0 && (
                                    <div className="col-span-full py-12 flex flex-col items-center justify-center bg-slate-50 rounded-3xl border-2 border-dashed border-slate-200">
                                        <div className="p-4 bg-white rounded-2xl shadow-sm mb-4">
                                            <Layers className="text-slate-300" size={32} />
                                        </div>
                                        <p className="text-slate-500 font-medium">No BOM recipes found</p>
                                        <button
                                            onClick={() => setEditingTemplate({ name: '', type: 'Book', components: [], isDefault: false })}
                                            className="mt-4 text-rose-600 font-bold hover:underline"
                                        >
                                            Create your first recipe
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default BOMRecipes;
