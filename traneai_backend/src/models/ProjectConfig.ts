import mongoose, { Document, Schema } from 'mongoose';

export interface IProjectConfigFile {
  id: string;
  name: string;
  fileName: string;
  path: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  checksum: string;
  encrypted: boolean;
}

export interface IProjectConfigRole {
  enabled: boolean;
  files: IProjectConfigFile[];
}

export interface IProjectConfig extends Document {
  projectName: string; // Will map to project.name in API
  project: {
    name: string;
    version: string;
    lastSynced: string;
  };
  roles: Record<string, IProjectConfigRole>;
  createdAt: Date;
  updatedAt: Date;
}

const fileSchema = new Schema<IProjectConfigFile>({
  id: { type: String, required: true },
  name: { type: String, required: true },
  fileName: { type: String, required: true },
  path: { type: String, required: true },
  version: { type: Number, required: true },
  createdAt: { type: String, required: true },
  updatedAt: { type: String, required: true },
  checksum: { type: String, required: true },
  encrypted: { type: Boolean, required: true }
}, { _id: false });

const roleSchema = new Schema<IProjectConfigRole>({
  enabled: { type: Boolean, default: true },
  files: { type: [fileSchema], default: [] }
}, { _id: false });

const projectConfigSchema = new Schema<IProjectConfig>(
  {
    projectName: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    project: {
      name: { type: String, required: true },
      version: { type: String, default: "1.0.0" },
      lastSynced: { type: String },
    },
    roles: {
      type: Map,
      of: roleSchema,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

export const ProjectConfig = mongoose.models.ProjectConfig || mongoose.model<IProjectConfig>('ProjectConfig', projectConfigSchema);
