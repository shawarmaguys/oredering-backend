import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CacheModule } from '@nestjs/cache-manager';
import { LoggerModule } from 'nestjs-pino';
import { getLoggerConfig } from './common/logger/logger.config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { LocationsModule } from './locations/locations.module';
import { VendorsModule } from './vendors/vendors.module';
import { ItemsModule } from './items/items.module';
import { StockRecordsModule } from './stock-records/stock-records.module';
import { PurchaseOrdersModule } from './purchase-orders/purchase-orders.module';
import { SchedulesModule } from './schedules/schedules.module';
import { ProductTypesModule } from './product-types/product-types.module';
import { TranslationsModule } from './translations/translations.module';

@Module({
  imports: [
    LoggerModule.forRoot(getLoggerConfig()),
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    CacheModule.register({
      isGlobal: true,
      ttl: 60000, // 60 seconds default TTL
    }),
    PrismaModule,
    AuthModule,
    UsersModule,
    LocationsModule,
    VendorsModule,
    ItemsModule,
    ProductTypesModule,
    StockRecordsModule,
    PurchaseOrdersModule,
    SchedulesModule,
    TranslationsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
