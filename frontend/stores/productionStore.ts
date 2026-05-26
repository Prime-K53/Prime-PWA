
import { create } from 'zustand';
import { ProductionBatch, WorkOrder, WorkCenter, ProductionResource, ResourceAllocation, MaintenanceLog, BillOfMaterial } from '../types';
import { api } from '../services/api';
import { dbService } from '../services/db';
import { productionDb } from '../services/productionDb';
import { HAS_REMOTE_BACKEND, getUrl } from '../config/api.js';
import { getRequestIdentityHeaders } from '../services/requestHeaders';
import { generateNextId } from '../utils/helpers';
import { MOCK_WORK_CENTERS, MOCK_RESOURCES } from '../constants';

const isProd = Boolean(import.meta.env?.PROD);

interface ProductionState {
  batches: ProductionBatch[];
  workOrders: WorkOrder[];
  workCenters: WorkCenter[];
  resources: ProductionResource[];
  allocations: ResourceAllocation[];
  maintenanceLogs: MaintenanceLog[];
  boms: BillOfMaterial[];
  isLoading: boolean;

  fetchProductionData: () => Promise<void>;

  addBatch: (batch: ProductionBatch) => Promise<void>;

  addWorkOrder: (wo: WorkOrder) => Promise<void>;
  updateWorkOrder: (wo: WorkOrder) => Promise<void>;
  deleteWorkOrder: (id: string) => Promise<void>;

  addAllocation: (allocation: ResourceAllocation) => Promise<void>;
  updateAllocation: (allocation: ResourceAllocation) => Promise<void>;
  deleteAllocation: (id: string) => Promise<void>;

  addMaintenanceLog: (log: MaintenanceLog) => Promise<void>;
  deleteMaintenanceLog: (id: string) => Promise<void>;

  addBOM: (bom: BillOfMaterial) => Promise<void>;
  updateBOM: (bom: BillOfMaterial) => Promise<void>;
  deleteBOM: (id: string) => Promise<void>;
}

export const useProductionStore = create<ProductionState>((set, get) => ({
  batches: [],
  workOrders: [],
  workCenters: [],
  resources: [],
  allocations: [],
  maintenanceLogs: [],
  boms: [],
  isLoading: false,

  fetchProductionData: async () => {
    set({ isLoading: true });
    try {
      const readFromDb = async <T>(store: string, dexieTable: any): Promise<T[]> => {
        try { return await dexieTable.toArray(); } catch { return dbService.getAll(store as any) as Promise<T[]>; }
      };
      const [batches, workOrders, allocations, maintenanceLogs, boms, localWorkCenters, localResources] = await Promise.all([
        readFromDb<ProductionBatch>('batches', productionDb.batches),
        readFromDb<WorkOrder>('workOrders', productionDb.workOrders),
        readFromDb<ResourceAllocation>('resourceAllocations', productionDb.resourceAllocations),
        readFromDb<MaintenanceLog>('maintenanceLogs', productionDb.maintenanceLogs),
        readFromDb<BillOfMaterial>('boms', productionDb.boms),
        readFromDb<WorkCenter>('workCenters', productionDb.workCenters),
        readFromDb<ProductionResource>('resources', productionDb.resources)
      ]);

      let workCenters: WorkCenter[] = localWorkCenters;
      let resources: ProductionResource[] = localResources;

      try {
        const shouldFetchRemoteLookups = HAS_REMOTE_BACKEND && (workCenters.length === 0 || resources.length === 0);
        if (!shouldFetchRemoteLookups) {
          throw new Error('Remote backend disabled in offline mode');
        }

        const headers = getRequestIdentityHeaders();
        const [wcResponse, resResponse] = await Promise.all([
          fetch(getUrl('production/work-centers'), { headers }),
          fetch(getUrl('production/resources'), { headers })
        ]);

        if (wcResponse.ok) {
          workCenters = await wcResponse.json();
          await Promise.all(workCenters.map((workCenter) => {
            try { return productionDb.workCenters.put(workCenter); } catch { return dbService.put('workCenters', workCenter); }
          }));
        }
        if (resResponse.ok) {
          resources = await resResponse.json();
          await Promise.all(resources.map((resource) => {
            try { return productionDb.resources.put(resource); } catch { return dbService.put('resources', resource); }
          }));
        }

        if (wcResponse.ok && resResponse.ok && workCenters.length > 0) {
          set({ batches, workOrders, workCenters, resources, allocations, maintenanceLogs, boms });
          return;
        }
      } catch {
        // Local IndexedDB is the primary read model. Remote lookup sync is best-effort only.
      }

      // In non-production environments, seed mock data ONLY if still empty
      if (workCenters.length === 0 && !isProd) {
        workCenters = MOCK_WORK_CENTERS;
        resources = MOCK_RESOURCES;
        for (const wc of MOCK_WORK_CENTERS) {
          try { await productionDb.workCenters.put(wc); } catch { await dbService.put('workCenters', wc); }
        }
        for (const r of MOCK_RESOURCES) {
          try { await productionDb.resources.put(r); } catch { await dbService.put('resources', r); }
        }
      }

      set({ batches, workOrders, workCenters, resources, allocations, maintenanceLogs, boms });
    } catch (error) {
      console.error("Failed to load production data", error);
    } finally {
      set({ isLoading: false });
    }
  },

  addBatch: async (batch) => {
    set(state => ({ batches: [...state.batches, batch] }));
    await api.production.saveBatch(batch);
  },

  addWorkOrder: async (wo) => {
    const newWO = { ...wo, id: wo.id || generateNextId('WO', get().workOrders) };
    set(state => ({ workOrders: [...state.workOrders, newWO] }));
    await api.production.saveWorkOrder(newWO);
  },
  updateWorkOrder: async (wo) => {
    set(state => ({ workOrders: state.workOrders.map(w => w.id === wo.id ? wo : w) }));
    await api.production.saveWorkOrder(wo);
  },
  deleteWorkOrder: async (id) => {
    set(state => ({ workOrders: state.workOrders.filter(w => w.id !== id) }));
    await api.production.deleteWorkOrder(id);
  },

  addAllocation: async (allocation) => {
    set(state => ({ allocations: [...state.allocations, allocation] }));
    await api.production.saveAllocation(allocation);
  },
  updateAllocation: async (allocation) => {
    set(state => ({ allocations: state.allocations.map(a => a.id === allocation.id ? allocation : a) }));
    await api.production.saveAllocation(allocation);
  },
  deleteAllocation: async (id) => {
    set(state => ({ allocations: state.allocations.filter(a => a.id !== id) }));
    await api.production.deleteAllocation(id);
  },

  addMaintenanceLog: async (log) => {
    const newLog = { ...log, id: log.id || generateNextId('MNT', get().maintenanceLogs) };
    set(state => ({ maintenanceLogs: [newLog, ...state.maintenanceLogs] }));
    await api.production.saveMaintenanceLog(newLog);
  },
  deleteMaintenanceLog: async (id) => {
    set(state => ({ maintenanceLogs: state.maintenanceLogs.filter(l => l.id !== id) }));
    await api.production.deleteMaintenanceLog(id);
  },

  addBOM: async (bom) => {
    set(state => ({ boms: [...state.boms, bom] }));
    await api.production.saveBOM(bom);
  },
  updateBOM: async (bom) => {
    set(state => ({ boms: state.boms.map(b => b.id === bom.id ? bom : b) }));
    await api.production.saveBOM(bom);
  },
  deleteBOM: async (id) => {
    set(state => ({ boms: state.boms.filter(b => b.id !== id) }));
    await api.production.deleteBOM(id);
  }
}));
