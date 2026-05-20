import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createUserDto: CreateUserDto) {
    const { fullName, email, password, role, locationIds } = createUserDto;

    // Check if email already exists
    const existing = await this.prisma.user.findUnique({
      where: { email },
    });
    if (existing) {
      throw new ConflictException('Email already registered');
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    const user = await this.prisma.user.create({
      data: {
        fullName,
        email,
        passwordHash,
        role,
        ...(locationIds && locationIds.length > 0
          ? {
              userLocations: {
                createMany: {
                  data: locationIds.map((locId) => ({ locationId: locId })),
                },
              },
            }
          : {}),
      },
      include: {
        userLocations: true,
      },
    });

    const { passwordHash: _, ...result } = user;
    return {
      ...result,
      locationIds: user.userLocations.map((ul) => ul.locationId),
    };
  }

  async findAll() {
    const users = await this.prisma.user.findMany({
      include: {
        userLocations: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    return users.map(({ passwordHash: _, userLocations, ...user }) => ({
      ...user,
      locationIds: userLocations.map((ul) => ul.locationId),
    }));
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        userLocations: true,
      },
    });
    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }
    const { passwordHash: _, userLocations, ...result } = user;
    return {
      ...result,
      locationIds: userLocations.map((ul) => ul.locationId),
    };
  }

  async update(id: string, updateUserDto: UpdateUserDto) {
    const user = await this.prisma.user.findUnique({
      where: { id },
    });
    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    const { locationIds, password, email, ...rest } = updateUserDto;

    const data: any = { ...rest };
    if (password) {
      data.passwordHash = await bcrypt.hash(password, 10);
    }

    if (email && email !== user.email) {
      const emailConflict = await this.prisma.user.findUnique({
        where: { email },
      });
      if (emailConflict) {
        throw new ConflictException('Email already in use');
      }
      data.email = email;
    }

    // Process update in transaction
    const updatedUser = await this.prisma.$transaction(async (tx) => {
      if (locationIds !== undefined) {
        // Delete all existing user locations first
        await tx.userLocation.deleteMany({
          where: { userId: id },
        });

        // Insert new user locations if provided
        if (locationIds.length > 0) {
          await tx.userLocation.createMany({
            data: locationIds.map((locId) => ({ userId: id, locationId: locId })),
          });
        }
      }

      return tx.user.update({
        where: { id },
        data,
        include: {
          userLocations: true,
        },
      });
    });

    const { passwordHash: _, userLocations, ...result } = updatedUser;
    return {
      ...result,
      locationIds: userLocations.map((ul) => ul.locationId),
    };
  }

  async deactivate(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
    });
    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    await this.prisma.user.update({
      where: { id },
      data: { isActive: false },
    });
  }
}
