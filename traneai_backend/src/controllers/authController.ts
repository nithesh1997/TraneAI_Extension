import { Request, Response } from 'express';
import { User } from '../models/User';

export async function handleLogout(req: Request, res: Response): Promise<void> {
  res.json({ success: true, message: 'Logged out successfully' });
}

export async function handleGetCurrentUser(req: Request, res: Response): Promise<void> {
  const user = (req as any).user;
  
  if (!user) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }

  try {
    const dbUser = await User.findById(user.id).select('-password');
    
    if (!dbUser) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json({
      user: {
        id: dbUser._id,
        email: dbUser.email,
        name: dbUser.name
      }
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to get user' });
  }
}
