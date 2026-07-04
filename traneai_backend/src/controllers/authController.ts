import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { User } from '../models/User.js';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

export async function handleSignup(req: Request, res: Response): Promise<void> {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required' });
      return;
    }

    if (!email.toLowerCase().includes('tranetechnologies.com')) {
      res.status(400).json({ error: 'Email must be a tranetechnologies.com address' });
      return;
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      res.status(409).json({ error: 'User already exists' });
      return;
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Using email username as default name
    const name = email.split('@')[0];

    let role = 'user';
    if (email.startsWith('superadmin@')) {
      role = 'superadmin';
    } else if (email.startsWith('admin@')) {
      role = 'admin';
    }

    const newUser = new User({
      email,
      password: hashedPassword,
      name,
      role
    });

    await newUser.save();

    const token = jwt.sign(
      { id: newUser._id, email: newUser.email, name: newUser.name, role: newUser.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      success: true,
      token,
      user: {
        id: newUser._id,
        email: newUser.email,
        name: newUser.name,
        role: newUser.role
      }
    });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ error: 'Failed to create user' });
  }
}

export async function handleLogin(req: Request, res: Response): Promise<void> {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required' });
      return;
    }

    if (!email.toLowerCase().includes('tranetechnologies.com')) {
      res.status(400).json({ error: 'Email must be a tranetechnologies.com address' });
      return;
    }

    const user = await User.findOne({ email });
    if (!user) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    let updatedRole = user.role;
    if (email.startsWith('superadmin@') && user.role !== 'superadmin') {
      user.role = 'superadmin';
      await user.save();
      updatedRole = 'superadmin';
    } else if (email.startsWith('admin@') && user.role !== 'admin') {
      user.role = 'admin';
      await user.save();
      updatedRole = 'admin';
    }

    const token = jwt.sign(
      { id: user._id, email: user.email, name: user.name, role: updatedRole },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      token,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        role: updatedRole
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Failed to log in' });
  }
}

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
        name: dbUser.name,
        role: dbUser.role
      }
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to get user' });
  }
}
