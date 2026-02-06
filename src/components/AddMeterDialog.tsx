import { useState, useEffect, useMemo } from 'react';
import { AlertTriangle, Info } from 'lucide-react';
import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogContent, DialogFooter } from './ui/Dialog';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { type GatewayType, type MeterType, getAvailableMeterTypes, N510_LIMITS } from '../utils/meterTemplate';
import type { MeterConfig } from '../config/meterConfigs';

interface Meter {
  name: string;
  index: number;
  slaveAddress: number;
  dataPointCount: number;
  meterType?: string;
}

interface AddMeterDialogProps {
  open: boolean;
  onClose: () => void;
  onAdd: (name: string, slaveAddress: number, meterType: MeterType) => void;
  existingMeters: Meter[];
  gatewayType: GatewayType;
}

export function AddMeterDialog({ open, onClose, onAdd, existingMeters, gatewayType }: AddMeterDialogProps) {
  const [name, setName] = useState('');
  const [slaveAddress, setSlaveAddress] = useState('');
  const [selectedMeterType, setSelectedMeterType] = useState<MeterType | ''>('');
  const [errors, setErrors] = useState<{ name?: string; slaveAddress?: string; meterType?: string }>({});
  const [availableMeters, setAvailableMeters] = useState<MeterConfig[]>([]);

  // Update available meters when gateway type changes
  useEffect(() => {
    const meters = getAvailableMeterTypes(gatewayType);
    setAvailableMeters(meters);
    // Set default meter type if available
    if (meters.length > 0 && !selectedMeterType) {
      setSelectedMeterType(meters[0].meterType);
    }
  }, [gatewayType, selectedMeterType]);

  const validate = () => {
    const newErrors: { name?: string; slaveAddress?: string; meterType?: string } = {};

    if (!name.trim()) {
      newErrors.name = 'Meter name is required';
    } else if (existingMeters.some(m => m.name === name.trim())) {
      newErrors.name = 'A meter with this name already exists';
    }

    const addr = parseInt(slaveAddress, 10);
    if (!slaveAddress || isNaN(addr)) {
      newErrors.slaveAddress = 'Slave address is required';
    } else if (addr < 1 || addr > 247) {
      newErrors.slaveAddress = 'Slave address must be between 1 and 247';
    } else if (existingMeters.some(m => m.slaveAddress === addr)) {
      newErrors.slaveAddress = 'This slave address is already in use';
    }

    if (!selectedMeterType) {
      newErrors.meterType = 'Please select a meter type';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validate() && selectedMeterType) {
      onAdd(name.trim(), parseInt(slaveAddress, 10), selectedMeterType);
      setName('');
      setSlaveAddress('');
      setErrors({});
    }
  };

  const handleClose = () => {
    setName('');
    setSlaveAddress('');
    setErrors({});
    onClose();
  };

  const selectedMeterConfig = availableMeters.find(m => m.meterType === selectedMeterType);

  // Calculate current and projected capacity usage for N510
  // The main limit is the JSON template size (2048 bytes), nodes are secondary
  const capacityInfo = useMemo(() => {
    if (gatewayType !== 'N510') return null;

    // Calculate current nodes (for reference)
    const currentNodes = existingMeters.reduce((sum, m) => sum + m.dataPointCount, 0);
    const newNodes = selectedMeterConfig?.dataPoints.length || 0;
    const projectedNodes = currentNodes + newNodes;

    // Estimate JSON template size (the main constraint at 2048 bytes)
    // Each meter contributes roughly: name length + fields * ~15 bytes per field
    const avgBytesPerField = 18; // e.g., "v_l1":"v_l1_0",
    const avgBytesPerMeterOverhead = 30; // brackets, meter name, etc.
    const currentTemplateSize = existingMeters.reduce(
      (sum, m) => sum + avgBytesPerMeterOverhead + (m.dataPointCount * avgBytesPerField),
      2 // opening/closing braces
    );
    const newTemplateSize = selectedMeterConfig
      ? avgBytesPerMeterOverhead + (selectedMeterConfig.reportingFields.length * avgBytesPerField)
      : 0;
    const projectedTemplateSize = currentTemplateSize + newTemplateSize;
    const templatePercentUsed = Math.round((projectedTemplateSize / N510_LIMITS.maxJsonTemplateBytes) * 100);

    return {
      currentNodes,
      newNodes,
      projectedNodes,
      maxNodes: N510_LIMITS.maxNodes,
      currentTemplateSize,
      projectedTemplateSize,
      maxTemplateSize: N510_LIMITS.maxJsonTemplateBytes,
      templatePercentUsed,
      isNearLimit: templatePercentUsed > 80,
      wouldExceed: projectedTemplateSize > N510_LIMITS.maxJsonTemplateBytes,
    };
  }, [gatewayType, existingMeters, selectedMeterConfig]);

  return (
    <Dialog open={open} onClose={handleClose}>
      <form onSubmit={handleSubmit}>
        <DialogHeader>
          <DialogTitle>Add Energy Meter</DialogTitle>
          <DialogDescription>
            Add a new energy meter to the gateway configuration. The meter will be added to both the Data Acquisition section and the JSON template.
          </DialogDescription>
        </DialogHeader>

        <DialogContent className="space-y-4">
          {/* Meter Type Selection */}
          <div className="space-y-2">
            <label htmlFor="meter-type" className="text-sm font-medium">
              Meter Type
            </label>
            <select
              id="meter-type"
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              value={selectedMeterType}
              onChange={(e) => setSelectedMeterType(e.target.value as MeterType)}
            >
              <option value="">Select a meter type...</option>
              {availableMeters.map(meter => (
                <option key={meter.meterType} value={meter.meterType}>
                  {meter.displayName}
                </option>
              ))}
            </select>
            {errors.meterType && (
              <p className="text-sm text-red-600">{errors.meterType}</p>
            )}
            {selectedMeterConfig && (
              <p className="text-xs text-gray-500">
                {selectedMeterConfig.dataPoints.length} data points, {selectedMeterConfig.reportingFields.length} reporting fields
              </p>
            )}
          </div>

          {/* Meter Name */}
          <div className="space-y-2">
            <label htmlFor="meter-name" className="text-sm font-medium">
              Meter Name
            </label>
            <Input
              id="meter-name"
              placeholder="e.g., Building A Panel 1"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            {errors.name && (
              <p className="text-sm text-red-600">{errors.name}</p>
            )}
            <p className="text-xs text-gray-500">
              This name will be used as the key in the JSON template
            </p>
          </div>

          {/* Slave Address */}
          <div className="space-y-2">
            <label htmlFor="slave-address" className="text-sm font-medium">
              Modbus Slave Address
            </label>
            <Input
              id="slave-address"
              type="number"
              min="1"
              max="247"
              placeholder="e.g., 1"
              value={slaveAddress}
              onChange={(e) => setSlaveAddress(e.target.value)}
            />
            {errors.slaveAddress && (
              <p className="text-sm text-red-600">{errors.slaveAddress}</p>
            )}
            <p className="text-xs text-gray-500">
              The Modbus address of the energy meter (1-247)
            </p>
          </div>

          {/* Gateway Info & Capacity */}
          <div className="rounded-md bg-blue-50 p-3">
            <p className="text-sm font-medium text-blue-700">Gateway Type: {gatewayType}</p>
            <p className="text-xs text-blue-600">
              Configuration will be generated specifically for this gateway type
            </p>
          </div>

          {/* N510 Capacity Indicator - JSON Template Size */}
          {capacityInfo && (
            <div className={`rounded-md p-3 ${capacityInfo.wouldExceed ? 'bg-red-50' : capacityInfo.isNearLimit ? 'bg-yellow-50' : 'bg-gray-50'}`}>
              <div className="flex items-center gap-2">
                {capacityInfo.wouldExceed ? (
                  <AlertTriangle className="h-4 w-4 text-red-600" />
                ) : capacityInfo.isNearLimit ? (
                  <AlertTriangle className="h-4 w-4 text-yellow-600" />
                ) : (
                  <Info className="h-4 w-4 text-gray-500" />
                )}
                <p className={`text-sm font-medium ${capacityInfo.wouldExceed ? 'text-red-700' : capacityInfo.isNearLimit ? 'text-yellow-700' : 'text-gray-700'}`}>
                  JSON Report: ~{capacityInfo.projectedTemplateSize} / {capacityInfo.maxTemplateSize} bytes ({capacityInfo.templatePercentUsed}%)
                </p>
              </div>
              <div className="mt-2">
                <div className="h-2 w-full rounded-full bg-gray-200">
                  <div
                    className={`h-2 rounded-full transition-all ${capacityInfo.wouldExceed ? 'bg-red-500' : capacityInfo.isNearLimit ? 'bg-yellow-500' : 'bg-green-500'}`}
                    style={{ width: `${Math.min(100, capacityInfo.templatePercentUsed)}%` }}
                  />
                </div>
              </div>
              <p className="mt-1 text-xs text-gray-600">
                Data points: {capacityInfo.projectedNodes} / {capacityInfo.maxNodes} nodes
                {selectedMeterConfig && ` (adding ${capacityInfo.newNodes})`}
              </p>
              {capacityInfo.wouldExceed && (
                <p className="mt-1 text-xs text-red-600">
                  Adding this meter may exceed the JSON report limit. Consider using a Lite meter type.
                </p>
              )}
            </div>
          )}

          {/* Existing Meters */}
          {existingMeters.length > 0 && (
            <div className="rounded-md bg-gray-50 p-3">
              <p className="text-sm font-medium text-gray-700">Existing meters:</p>
              <div className="mt-1 space-y-1">
                {existingMeters.map(m => (
                  <div key={m.name} className="text-xs text-gray-500">
                    <span className="font-medium">{m.name}</span>
                    <span className="ml-2">
                      (Slave {m.slaveAddress}{m.meterType ? `, ${m.meterType}` : ''})
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </DialogContent>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={!selectedMeterType}>
            Add Meter
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
