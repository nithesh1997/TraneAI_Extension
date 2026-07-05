import mongoose, { Document, Schema } from 'mongoose';

export interface IWorkspaceFile extends Document {
  filePath: string; // Used as the unique identifier for the workspace path (e.g. '.traneAI/developer/rules.md')
  content: string; // The encrypted or plaintext content
  checksum: string;
  encrypted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const workspaceFileSchema = new Schema<IWorkspaceFile>(
  {
    filePath: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    content: {
      type: String,
      default: '',
    },
    checksum: {
      type: String,
      required: true,
    },
    encrypted: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

export const WorkspaceFile = mongoose.models.WorkspaceFile || mongoose.model<IWorkspaceFile>('WorkspaceFile', workspaceFileSchema);
