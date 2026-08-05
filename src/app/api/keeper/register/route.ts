import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { user } = body;

    if (!user) {
      return NextResponse.json({ error: 'User address required' }, { status: 400 });
    }

    const filePath = path.join(process.cwd(), 'registered_users.json');
    let users: string[] = [];

    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf8');
      if (data) {
        users = JSON.parse(data);
      }
    }

    if (!users.includes(user)) {
      users.push(user);
      fs.writeFileSync(filePath, JSON.stringify(users, null, 2));
    }

    return NextResponse.json({ success: true, users });
  } catch (error) {
    console.error('Error saving registered user:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
